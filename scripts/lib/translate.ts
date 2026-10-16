import type { AIItem } from "../../lib/types";
import { extractJsonArray, stripRefMarks } from "../../lib/llmClean";
import {
  describeLlmKey,
  llmEndpoint,
  redactSecrets,
  resolveLlmApiKey,
  resolveLlmBaseUrl,
  resolveLlmModel,
} from "./llmConfig";

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

/**
 * Per-run translation budget: enough to clear the English backlog plus
 * the day's new headlines in a single crawl.
 */
const DEFAULT_MAX = 600;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 45_000;
const BATCH_SIZE = 12;
/** Hard cap on a translated headline; the prompt asks for <= 40 characters. */
const MAX_TITLE_CHARS = 80;
/**
 * Token budget per item. A translated headline is short, but JSON overhead,
 * long upstream titles and reasoning models need far more headroom than the
 * old `items * 90`, which truncated replies and silently dropped whole
 * batches. The floor keeps a small batch from starving.
 */
const TOKENS_PER_ITEM = 160;
const MIN_MAX_TOKENS = 2000;
/**
 * How deep a failing batch may be halved. 12 -> 6 -> 3 -> 2 -> 1 isolates a
 * single poison headline in at most four splits.
 */
const MAX_SPLIT_DEPTH = 4;

const SYSTEM =
  "你是 AI 资讯编辑。请把每条资讯的英文标题翻译成简体中文，只输出 JSON 数组，不要 Markdown。" +
  "对每条返回：id（原样）、zh（中文标题）。要求：" +
  "1. 保留专有名词与产品名原样（GPT-5、Claude、Llama、Qwen、CUDA 等），必要时在中文后用括号补充；" +
  "2. 不要逐字硬译，用中文资讯标题的写法，简洁通顺，不超过 40 个汉字；" +
  "3. 不添加原文没有的信息，不加书名号或引号，结尾不加句号；" +
  "4. 若标题本身已是中文则原样返回。输出 JSON 数组，不要额外文字。";

/** Minimal fetch shape so tests can inject a stub transport. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface AddTitleZhOptions {
  apiKey?: string | null;
  baseUrl?: string;
  model?: string;
  max?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Override the transport (tests); defaults to the global fetch. */
  fetchImpl?: FetchLike;
}

interface TitleRow {
  id: string;
  zh: string;
}

interface RequestContext {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
}

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
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

/**
 * Newest first, heat as the tie-breaker. The home list renders newest-first,
 * so translating in that order is what keeps English off the first screen.
 */
export function sortPendingForTranslation(pending: AIItem[]): AIItem[] {
  const timeKey = (i: AIItem) => i.publishedAt ?? i.firstSeen ?? i.fetchedAt ?? "";
  return [...pending].sort((a, b) => {
    const ta = timeKey(a);
    const tb = timeKey(b);
    if (ta !== tb) return ta < tb ? 1 : -1;
    return (b.heat ?? 0) - (a.heat ?? 0);
  });
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

/** One-line, secret-free description of a failed request for the crawl log. */
function describeError(err: unknown, apiKey: string): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const withoutKey = apiKey ? raw.split(apiKey).join("***") : raw;
  const redacted = redactSecrets(withoutKey).replace(/\s+/g, " ").trim();
  return redacted.length > 240 ? `${redacted.slice(0, 240)}...` : redacted;
}

async function requestBatch(items: AIItem[], ctx: RequestContext): Promise<TitleRow[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ctx.timeoutMs);
  try {
    const payload = items.map((item) => ({ id: item.id, title: item.title }));
    const res = await ctx.fetchImpl(llmEndpoint(ctx.baseUrl), {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ctx.model,
        temperature: 0.2,
        max_tokens: Math.max(MIN_MAX_TOKENS, items.length * TOKENS_PER_ITEM),
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify({ items: payload }) },
        ],
      }),
    });
    if (!res.ok) {
      const detail = redactSecrets((await res.text().catch(() => "")).slice(0, 200));
      throw new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseBatch(data.choices?.[0]?.message?.content ?? "");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try a batch twice, and report whether the transport itself ever answered.
 * `ok: false` means both attempts threw (HTTP error, abort, network); the
 * caller then stops instead of splitting, since a dead endpoint will not heal
 * by sending more requests.
 */
async function requestWithRetry(
  items: AIItem[],
  ctx: RequestContext,
): Promise<{ rows: TitleRow[]; ok: boolean }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { rows: await requestBatch(items, ctx), ok: true };
    } catch (err) {
      lastError = err; // one retry absorbs transient upstream failures
    }
  }
  console.warn(
    `[translate] batch of ${items.length} failed after 2 attempts: ` +
      describeError(lastError, ctx.apiKey),
  );
  return { rows: [], ok: false };
}

/**
 * Translate one subset into `out`, then halve whatever is still missing so a
 * single truncated reply or un-translatable headline cannot drop the batch.
 * Successful rows are kept as-is; only the missing ids are re-requested.
 */
async function collectTranslations(
  subset: AIItem[],
  ctx: RequestContext,
  depth: number,
  out: Map<string, string>,
): Promise<void> {
  if (subset.length === 0) return;
  const { rows, ok } = await requestWithRetry(subset, ctx);
  const byId = new Map(rows.map((r) => [r.id, r.zh]));

  const missing: AIItem[] = [];
  for (const item of subset) {
    const zh = cleanZh(byId.get(item.id), item.title);
    if (zh) out.set(item.id, zh);
    else missing.push(item);
  }

  // Transport failure already logged; a lone unsalvageable item can be split
  // no further, so both cases stop here.
  if (missing.length === 0 || !ok) return;
  if (missing.length === 1 || depth >= MAX_SPLIT_DEPTH) return;

  if (depth === 0 && missing.length === subset.length) {
    console.warn(
      `[translate] batch of ${subset.length} returned no usable rows; splitting to isolate failures.`,
    );
  }
  const half = Math.ceil(missing.length / 2);
  await collectTranslations(missing.slice(0, half), ctx, depth + 1, out);
  await collectTranslations(missing.slice(half), ctx, depth + 1, out);
}

/**
 * Translate English headlines to Chinese and stamp them as `titleZh`.
 * Already-Chinese titles and items carrying a cached `titleZh` are skipped.
 * Newest items go first (heat breaks ties) so the time-ordered home list
 * turns Chinese on its first screen before the long tail.
 */
export async function addChineseTitles(
  items: AIItem[],
  options: AddTitleZhOptions = {},
): Promise<AIItem[]> {
  if (items.length === 0) return items;

  const apiKey = resolveLlmApiKey(options.apiKey);
  if (!apiKey) {
    console.log("[translate] no LLM key — keeping original titles.");
    return items;
  }

  const baseUrl = resolveLlmBaseUrl(options.baseUrl);
  const model = resolveLlmModel(options.model);
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
  const targets = sortPendingForTranslation(pending).slice(0, max);
  if (targets.length === 0) {
    console.log("[translate] nothing to translate.");
    return items;
  }

  const batches: AIItem[][] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    batches.push(targets.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `[translate] endpoint ${llmEndpoint(baseUrl)} model ${model} key ${describeLlmKey(apiKey)} ` +
      `batches ${batches.length} concurrency ${concurrency}`,
  );

  const ctx: RequestContext = {
    apiKey,
    baseUrl,
    model,
    timeoutMs,
    fetchImpl: options.fetchImpl ?? fetch,
  };

  const translated = new Map<string, string>();
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const batch = batches[cursor++];
      if (!batch) return;
      await collectTranslations(batch, ctx, 0, translated);
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