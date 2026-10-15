import type { AIItem, Significance } from "./types";
import { isEventType } from "./significance";

/**
 * Schema guard between untrusted upstream feeds and everything downstream
 * (snapshot, append-only archive, open API, static pages). A hijacked or
 * malformed source must not be able to inject junk protocols, unbounded
 * fields or wrong types into the pipeline — invalid items are dropped,
 * oversized fields are clamped.
 */

const MAX = {
  id: 200,
  title: 300,
  summary: 2000,
  source: 100,
  url: 2048,
  aiNote: 300,
  tag: 50,
  tags: 20,
  significanceReason: 60,
  significanceModel: 100,
} as const;

/** http(s) only — rejects javascript:, data:, file:, protocol-relative etc. */
function safeUrl(u: unknown, httpsOnly = false): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (s.length === 0 || s.length > MAX.url) return null;
  if (httpsOnly) return s.startsWith("https://") ? s : null;
  return s.startsWith("https://") || s.startsWith("http://") ? s : null;
}

function clampText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length === 0 ? null : s.slice(0, max);
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : v;
}

function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Significance is optional, but once present it is validated as a whole.
 * A valid stored verdict is preserved verbatim so changing the build-time
 * threshold never rewrites historical milestone decisions.
 */
function sanitizeSignificance(v: unknown): Significance | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;
  const score = clampScore(raw.score);
  if (score === null || !isEventType(raw.type)) return null;
  if (raw.verdict !== "milestone" && raw.verdict !== "daily") return null;
  if (raw.method !== "ai" && raw.method !== "rule") return null;
  if (typeof raw.reason !== "string") return null;
  const scoredAt = isoOrNull(raw.scoredAt);
  if (!scoredAt) return null;
  const model = raw.model === null || raw.model === undefined
    ? null
    : clampText(raw.model, MAX.significanceModel);
  if (raw.model !== null && raw.model !== undefined && model === null) return null;

  return {
    score,
    type: raw.type,
    reason: raw.reason.trim().slice(0, MAX.significanceReason),
    verdict: raw.verdict,
    method: raw.method,
    model,
    scoredAt,
  };
}

/** Validate + clamp a single item; null when it must be dropped. */
export function sanitizeItem(raw: AIItem): AIItem | null {
  const id = clampText(raw.id, MAX.id);
  const title = clampText(raw.title, MAX.title);
  const sourceUrl = safeUrl(raw.sourceUrl);
  const source = clampText(raw.source, MAX.source);
  if (!id || !title || !sourceUrl || !source) return null;

  const heat = typeof raw.heat === "number" && Number.isFinite(raw.heat) && raw.heat >= 0
    ? Math.round(raw.heat)
    : 0;
  const engagement =
    typeof raw.engagement === "number" && Number.isFinite(raw.engagement) && raw.engagement > 0
      ? Math.round(raw.engagement)
      : undefined;
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .slice(0, MAX.tags)
        .map((t) => t.trim().slice(0, MAX.tag))
    : undefined;

  return {
    ...raw,
    id,
    title,
    source,
    sourceUrl,
    summary: clampText(raw.summary, MAX.summary),
    aiNote: clampText(raw.aiNote, MAX.aiNote),
    significance: sanitizeSignificance(raw.significance),
    image: safeUrl(raw.image, true), // https only — no mixed content
    heat,
    engagement,
    tags,
    publishedAt: isoOrNull(raw.publishedAt),
    firstSeen: isoOrNull(raw.firstSeen),
    fetchedAt: isoOrNull(raw.fetchedAt),
  };
}

export interface SanitizeResult {
  items: AIItem[];
  dropped: number;
}

/** Validate a batch; invalid items are dropped (count reported for meta.errors). */
export function sanitizeItems(items: AIItem[]): SanitizeResult {
  const out: AIItem[] = [];
  let dropped = 0;
  for (const raw of items) {
    const it = sanitizeItem(raw);
    if (it) out.push(it);
    else dropped++;
  }
  return { items: out, dropped };
}
