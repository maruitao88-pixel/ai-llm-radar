import type { AIItem } from "../../lib/types";
import { extractJsonArray, stripRefMarks } from "../../lib/llmClean";

/**
 * Chinese title backfill.
 *
 * Most upstream feeds publish English headlines (Hacker News, arXiv, GitHub,
 * Hugging Face papers), which makes the site hard to scan for a Chinese
 * reader. This step asks the LLM to translate the headlines that need it and
 * caches the result on the item as `titleZh`; the original `title` is kept and
 * rendered underneath as a secondary line.
 *
 * Results are cached across runs (applyHistory carries `titleZh` forward by
 * id), so a headline is only ever paid for once. No API key -> quiet no-op and
 * the site keeps showing original titles.
 */

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_MAX = 400;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 45_000;
const BATCH_SIZE = 12;
/** Hard cap on a translated headline; the prompt asks for <= 40 characters. */
const MAX_TITLE_CHARS = 80;

const SYSTEM =
  "你是 AI 资讯编辑。请把每条资讯的英文标题翻译成简体中文，只输出 JSON 数组，不要 Markdown。" +
  "对每条返回：id（原样）、zh（中文标题）。要求：" +
  "1. 保留专有名词与产品名原样（GPT-5、Claude、Llama、Qwen、CUDA 等），必要时在中文后用括号补充；" +
  "2. 不要逐字硬译，用中文资讯标题的写法，简洁通顺，不超过 40 个汉字；" +
  "3. 不添加原文没有的信息，不加书名号或引号，结尾不加句号；" +
  "4. 若标题本身已是中文则原样返回。输出 JSON 数组，不要额外文字。";

export interface AddTitleZhOptions {
  apiKey?: string | null;
  baseUrl?: string;
  model?: string;
  max?: number;
  concurrency?: number;
  timeoutMs?: number;
}

interface TitleRow {
  id: string;
  zh: string;
}

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function endpoint(baseUrl: string): string {
  const base = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

/** CJK ideograph count — 2+ means the headline already reads as Chinese. */
function cjkCount(s: string): number {
  let n = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) n++;
  }
  return n;
}

/** True when a headline still needs a Chinese version. */
export function needsTranslation(title: string): boolean {
  return cjkCount(title) < 2;
}

function parseBatch(raw: string): TitleRow[] {
  const rows = extractJsonArray<Record<string, unknown>>(raw);
  if (!rows) return [];
  const out: TitleRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const id = row.id;
    const zh = row.zh ?? row.titleZh ?? row.zhTitle;
    if (typeof id !== "string" || typeof zh !== "string") continue;
    out.push({ id, zh });
  }
  return out;
}

/** Trim quotes/wrapper text and reject empty or unchanged results. */
function cleanZh(raw: unknown, fallback: string): string | null {
  if (typeof raw !== "string") return null;
  const zh = stripRefMarks(
    raw
      .replace(/^[\s"'\u201c\u201d\u300c\u300d\u300e\u300f]+/, "")
      .replace(/[\s"'\u201c\u201d\u300c\u300d\u300e\u300f]+$/, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (!zh) return null;
  if (zh === fallback.trim()) return null; // unchanged -> not a translation
  return zh.slice(0, MAX_TITLE_CHARS);
}

async function requestBatch(
  items: AIItem[],
  opts: { apiKey: string; baseUrl: string; model: string; timeoutMs: number },
): Promise<TitleRow[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const payload = items.map((item) => ({ id: item.id, title: item.title }));
    const res = await fetch(endpoint(opts.baseUrl), {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        max_tokens: Math.max(300, items.length * 90),
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify({ items: payload }) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseBatch(data.choices?.[0]?.message?.content ?? "");
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry(
  items: AIItem[],
  opts: { apiKey: string; baseUrl: string; model: string; timeoutMs: number },
): Promise<TitleRow[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await requestBatch(items, opts);
    } catch {
      // one retry absorbs transient upstream failures
    }
  }
  return [];
}

/**
 * Translate English headlines to Chinese and stamp them as `titleZh`.
 * Already-Chinese titles and items carrying a cached `titleZh` are skipped.
 * Hottest items go first so page 1 fills in before the long tail.
 */
export async function addChineseTitles(
  items: AIItem[],
  options: AddTitleZhOptions = {},
): Promise<AIItem[]> {
  if (items.length === 0) return items;

  const apiKey = options.apiKey !== undefined
    ? options.apiKey
    : process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || null;
  if (!apiKey) {
    console.log("[translate] no LLM key — keeping original titles.");
    return items;
  }

  const baseUrl = options.baseUrl ?? process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL;
  const model = options.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;
  const max = Math.max(0, Math.floor(options.max ?? envNumber("TRANSLATE_MAX", DEFAULT_MAX)));
  const concurrency = Math.max(
    1,
    Math.floor(options.concurrency ?? envNumber("TRANSLATE_CONCURRENCY", DEFAULT_CONCURRENCY)),
  );
  const timeoutMs = Math.max(
    1,
    Math.floor(options.timeoutMs ?? envNumber("TRANSLATE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)),
  );

  const pending: AIItem[] = [];
  for (const item of items) {
    if (item.titleZh) continue; // cached from an earlier crawl
    if (!needsTranslation(item.title)) continue;
    pending.push(item);
  }
  pending.sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0));
  const targets = pending.slice(0, max);
  if (targets.length === 0) {
    console.log("[translate] nothing to translate.");
    return items;
  }

  const batches: AIItem[][] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    batches.push(targets.slice(i, i + BATCH_SIZE));
  }

  const translated = new Map<string, string>();
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const batch = batches[cursor++];
      if (!batch) return;
      const rows = await requestWithRetry(batch, { apiKey, baseUrl, model, timeoutMs });
      const byId = new Map(rows.map((r) => [r.id, r.zh]));
      for (const item of batch) {
        const zh = cleanZh(byId.get(item.id), item.title);
        if (zh) translated.set(item.id, zh);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));

  const stillPending = pending.length - translated.size;
  console.log(
    `[translate] queued ${targets.length}, translated ${translated.size}, ` +
      `${stillPending} still English (model: ${model}).`,
  );

  if (translated.size === 0) return items;
  return items.map((item) => {
    const zh = translated.get(item.id);
    return zh ? { ...item, titleZh: zh } : item;
  });
}