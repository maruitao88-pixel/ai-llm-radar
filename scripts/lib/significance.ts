import type { AIItem, EventType, Significance } from "../../lib/types";
import {
  parseSignificanceResponse,
  ruleScore,
  significanceFromParsed,
  significanceFromRule,
  top10PercentIds,
} from "../../lib/significance";
import {
  describeLlmKey,
  llmEndpoint,
  redactSecrets,
  resolveLlmApiKey,
  resolveLlmBaseUrl,
  resolveLlmModel,
} from "./llmConfig";

/**
 * LLM significance scoring with a deterministic rule fallback.
 *
 * One request scores a batch of items and returns both the impact reason and a
 * short AI note, so the crawl needs only one model call per batch. Anything the
 * model cannot score falls back to `ruleScore`, which keeps the timeline useful
 * during an outage or when no API key is configured.
 */

const DEFAULT_MAX = 60;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 30_000;
const BATCH_SIZE = 10;

const SYSTEM =
  "你是资深 AI 行业分析师。请评估每条资讯的行业显著性，并只输出 JSON，不要 Markdown。" +
  "对每条资讯返回：id（原样）、score（0-100 整数）、type（model-release|capability|funding|policy|opensource|other）、" +
  "reason（不超过 60 个汉字，说明为什么重要）、aiNote（不超过 50 个汉字的一句话看点）。" +
  "评分标准：重大模型发布、能力突破、重大融资并购、重要政策监管、里程碑式开源事件通常 >= 80；" +
  "常规更新、教程、论文、一般讨论通常 < 80。输出 JSON 数组，不要额外文字。";

export interface AddSignificanceOptions {
  apiKey?: string | null;
  threshold?: number;
  now?: Date;
  baseUrl?: string;
  model?: string;
  max?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Optional pre-dedupe source counts keyed by normalized title (or item id). */
  sourceCounts?: Map<string, number>;
}

interface BatchResult {
  id: string;
  score: number;
  type: EventType;
  reason: string;
  aiNote: string;
}

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function scoredAt(now: Date): string {
  return Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString();
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** Count unique sources per story before dedupe drops the duplicates. */
export function buildSourceCounts(items: AIItem[]): Map<string, number> {
  const sources = new Map<string, Set<string>>();
  for (const item of items) {
    const key = titleKey(item.title);
    if (!key) continue;
    if (!sources.has(key)) sources.set(key, new Set());
    sources.get(key)!.add(item.source);
  }
  const out = new Map<string, number>();
  for (const [key, set] of sources) out.set(key, set.size);
  return out;
}

function sourceCountFor(item: AIItem, counts?: Map<string, number>): number {
  return counts?.get(titleKey(item.title)) ?? counts?.get(item.id) ?? 1;
}

function textFor(item: AIItem): string {
  return [item.title, item.summary ?? "", ...(item.tags ?? [])].join(" ");
}

function ruleFor(
  item: AIItem,
  threshold: number,
  now: Date,
  hotIds: Set<string>,
  counts?: Map<string, number>,
): Significance {
  const result = ruleScore(
    {
      tier: item.tier,
      text: textFor(item),
      hotTop10Percent: hotIds.has(item.id),
      sourceCount: sourceCountFor(item, counts),
    },
    { now, threshold },
  );
  return significanceFromRule(result, scoredAt(now));
}

function extractJsonArray(raw: string): unknown[] | null {
  const text = raw.trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const tryParse = (value: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { results?: unknown }).results)) {
        return (parsed as { results: unknown[] }).results;
      }
      return null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(candidate);
  if (direct) return direct;
  const block = candidate.match(/\[[\s\S]*\]/);
  return block ? tryParse(block[0]) : null;
}

function parseBatch(raw: string): BatchResult[] {
  const rows = extractJsonArray(raw);
  if (!rows) return [];
  const out: BatchResult[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const obj = row as Record<string, unknown>;
    if (typeof obj.id !== "string") continue;
    const parsed = parseSignificanceResponse(JSON.stringify(obj));
    if (!parsed) continue;
    out.push({ id: obj.id, ...parsed });
  }
  return out;
}

async function requestBatch(
  items: AIItem[],
  opts: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
    sourceCounts?: Map<string, number>;
  },
): Promise<BatchResult[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const payload = items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary ?? "",
      source: item.source,
      tier: item.tier ?? 3,
      heat: item.heat ?? 0,
      sourceCount: sourceCountFor(item, opts.sourceCounts),
    }));
    const res = await fetch(llmEndpoint(opts.baseUrl), {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        max_tokens: Math.max(400, items.length * 160),
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

async function requestWithRetry(
  items: AIItem[],
  opts: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
    sourceCounts?: Map<string, number>;
  },
): Promise<BatchResult[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await requestBatch(items, opts);
    } catch {
      // one retry keeps transient upstream failures from forcing rule fallback
    }
  }
  return [];
}

/**
 * Score items that do not already have a cached significance record.
 * The optional options make the function deterministic in tests and allow CI
 * configuration without touching module-level globals.
 */
export async function addSignificance(
  items: AIItem[],
  options: AddSignificanceOptions = {},
): Promise<AIItem[]> {
  if (items.length === 0) return items;

  const apiKey = resolveLlmApiKey(options.apiKey);
  const threshold = options.threshold ?? envNumber("SIGNIFICANCE_THRESHOLD", 80);
  const now = options.now ?? new Date();
  const baseUrl = resolveLlmBaseUrl(options.baseUrl);
  const model = resolveLlmModel(options.model);
  const max = Math.max(0, Math.floor(options.max ?? envNumber("SIGNIFICANCE_MAX", DEFAULT_MAX)));
  const concurrency = Math.max(
    1,
    Math.floor(options.concurrency ?? envNumber("SIGNIFICANCE_CONCURRENCY", DEFAULT_CONCURRENCY)),
  );
  const timeoutMs = Math.max(
    1,
    Math.floor(options.timeoutMs ?? envNumber("SIGNIFICANCE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)),
  );

  const scored = new Map<string, Significance>();
  const notes = new Map<string, string>();
  const hotIds = top10PercentIds(items);
  const empty = items.filter((item) => !item.significance);
  const aiTargets = apiKey ? empty.slice(0, max) : [];

  const applyRuleFallback = (item: AIItem) => {
    if (scored.has(item.id)) return;
    scored.set(item.id, ruleFor(item, threshold, now, hotIds, options.sourceCounts));
  };

  if (aiTargets.length > 0 && apiKey) {
    console.log(
      `[significance] endpoint ${llmEndpoint(baseUrl)} model ${model} key ${describeLlmKey(apiKey)}`,
    );
    const batches: AIItem[][] = [];
    for (let i = 0; i < aiTargets.length; i += BATCH_SIZE) {
      batches.push(aiTargets.slice(i, i + BATCH_SIZE));
    }

    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const batch = batches[cursor++];
        if (!batch) return;
        const results = await requestWithRetry(batch, { apiKey, baseUrl, model, timeoutMs, sourceCounts: options.sourceCounts });
        const byId = new Map(results.map((r) => [r.id, r]));
        for (const item of batch) {
          const result = byId.get(item.id);
          if (!result) continue;
          scored.set(
            item.id,
            significanceFromParsed(result, { threshold, model, scoredAt: scoredAt(now) }),
          );
          if (result.aiNote) notes.set(item.id, result.aiNote);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));
  } else if (!apiKey) {
    console.log("[significance] no LLM key — using rule scoring.");
  }

  for (const item of empty) {
    if (!scored.has(item.id)) applyRuleFallback(item);
  }

  const aiCount = [...scored.values()].filter((s) => s.method === "ai").length;
  console.log(`[significance] scored ${empty.length} item(s), ${aiCount} by AI, ${empty.length - aiCount} by rules.`);

  return items.map((item) => {
    if (item.significance) return item;
    const significance = scored.get(item.id);
    if (!significance) return item;
    const aiNote = notes.get(item.id);
    return {
      ...item,
      significance,
      ...(aiNote && !item.aiNote ? { aiNote } : {}),
    };
  });
}
