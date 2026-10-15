import type { EventType, Significance } from "./types";

/**
 * Pure significance helpers — no fs / no network / no env access, so this module
 * is safe on the client AND inside the crawl pipeline.
 *
 * The LLM produces a 0-100 "significance" score; when the LLM is unavailable,
 * `ruleScore` derives a deterministic score from credibility + keyword + heat +
 * multi-source signals so the timeline never silently empties.
 */

/** Default milestone cut-off (0-100). Env SIGNIFICANCE_THRESHOLD may override it. */
export const DEFAULT_SIGNIFICANCE_THRESHOLD = 80;
export const EVENT_TYPES: readonly EventType[] = [
  "model-release",
  "capability",
  "funding",
  "policy",
  "opensource",
  "other",
] as const;

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  "model-release": "模型发布",
  capability: "能力突破",
  funding: "融资并购",
  policy: "政策监管",
  opensource: "开源开放",
  other: "行业事件",
};

/**
 * Resolve a milestone threshold with a lower-bound guard: only finite values
 * inside 0-100 are honoured, so a stray/env `0` cannot push every item over the
 * line. Everything else falls back to `DEFAULT_SIGNIFICANCE_THRESHOLD`.
 */
export function resolveThreshold(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return DEFAULT_SIGNIFICANCE_THRESHOLD;
  return Math.round(n);
}
export function isEventType(v: unknown): v is EventType {
  return typeof v === "string" && (EVENT_TYPES as readonly string[]).includes(v);
}

/** Clamp a raw score into an integer 0-100. Non-numeric input becomes 0. */
export function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Threshold split: >= threshold is a milestone, everything else is daily. */
export function verdictFor(score: number, threshold: number): "milestone" | "daily" {
  return score >= threshold ? "milestone" : "daily";
}

export interface ParsedSignificance {
  score: number;
  type: EventType;
  reason: string;
  aiNote: string;
}

/** Pull the first JSON value out of a response that may be fenced or padded. */
function extractJson(raw: string): unknown {
  const text = raw.trim();
  if (text.length === 0) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const block = candidate.match(/\{[\s\S]*\}/);
    if (block) {
      try {
        return JSON.parse(block[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Parse one LLM significance object. Tolerant on every field except `score`:
 * a missing/invalid score is a hard failure (caller falls back to rules), while
 * a bad `type` becomes "other" and a non-string `reason` becomes "".
 */
export function parseSignificanceResponse(raw: string): ParsedSignificance | null {
  if (typeof raw !== "string") return null;
  const obj = extractJson(raw);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if (o.score === undefined || o.score === null) return null;
  const rawScore = typeof o.score === "number" ? o.score : Number(o.score);
  if (!Number.isFinite(rawScore)) return null;
  return {
    score: clampScore(rawScore),
    type: isEventType(o.type) ? o.type : "other",
    reason: typeof o.reason === "string" ? o.reason.trim().slice(0, 60) : "",
    aiNote: typeof o.aiNote === "string" ? o.aiNote.trim().slice(0, 50) : "",
  };
}

/** Build a full Significance record from a parsed LLM reply. */
export function significanceFromParsed(
  parsed: ParsedSignificance,
  opts: { threshold: number; model: string; scoredAt: string },
): Significance {
  return {
    score: parsed.score,
    type: parsed.type,
    reason: parsed.reason,
    verdict: verdictFor(parsed.score, opts.threshold),
    method: "ai",
    model: opts.model,
    scoredAt: opts.scoredAt,
  };
}

export interface RuleInput {
  tier?: 1 | 2 | 3;
  /** Title + summary + tags — everything we keyword-match on. */
  text: string;
  hotTop10Percent: boolean;
  sourceCount: number;
}

export interface RuleOptions {
  now: Date;
  threshold: number;
}

export interface RuleResult {
  score: number;
  type: EventType;
  reason: string;
  verdict: "milestone" | "daily";
  method: "rule";
}

const TIER_POINTS: Record<number, number> = { 1: 40, 2: 25, 3: 15 };
const KEYWORD_POINTS = 30;
const HEAT_POINTS = 20;
const MULTI_SOURCE_POINTS = 10;
const MULTI_SOURCE_MIN = 3;

/**
 * Ordered keyword table — first match decides the event type. Deliberately
 * excludes generic verbs like 更新/升级 so routine product churn earns no bonus.
 */
const KEYWORD_SETS: { type: EventType; re: RegExp }[] = [
  { type: "opensource", re: /(开源|开放权重|开放模型|open[\s-]?weights?|open[\s-]?source)/i },
  {
    type: "funding",
    re: /(融资|投资|并购|收购|估值|上市|ipo|billion|million|acquire|acquisition|merger|valuation|raises?\b|raised\b)/i,
  },
  {
    type: "policy",
    re: /(监管|政策|法案|合规|管制|禁令|regulation|regulatory|antitrust|export[\s-]?control|policy)/i,
  },
  {
    type: "model-release",
    re: /(发布|推出|上线|亮相|问世|新模型|新一代|旗舰|launch|released?|unveil|announce|debut|rollout)/i,
  },
  {
    type: "capability",
    re: /(sota|突破|多模态|长上下文|推理|基准|超越|刷新|benchmark|multimodal|breakthrough|state[\s-]?of[\s-]?the[\s-]?art|reasoning)/i,
  },
];

function typeFor(text: string): EventType {
  for (const set of KEYWORD_SETS) if (set.re.test(text)) return set.type;
  return "other";
}

/**
 * Deterministic fallback scoring. Signals come straight from the design doc:
 * tier base (40/25/15) + major keyword (30) + heat in the day's top 10% (20)
 * + reported by >= 3 sources (10), capped at 100.
 */
export function ruleScore(input: RuleInput, opts: RuleOptions): RuleResult {
  const tier = input.tier ?? 3;
  const text = input.text ?? "";
  let score = TIER_POINTS[tier] ?? TIER_POINTS[3];
  const type = typeFor(text);
  const signals: string[] = [`tier${tier}`];
  if (type !== "other") {
    score += KEYWORD_POINTS;
    signals.push("关键词");
  }
  if (input.hotTop10Percent) {
    score += HEAT_POINTS;
    signals.push("热度前10%");
  }
  if (input.sourceCount >= MULTI_SOURCE_MIN) {
    score += MULTI_SOURCE_POINTS;
    signals.push(`${input.sourceCount}来源`);
  }
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    type,
    reason: `规则判定（${signals.join(" + ")}）`,
    verdict: verdictFor(score, opts.threshold),
    method: "rule",
  };
}

/** Assemble a Significance record from a rule result. */
export function significanceFromRule(rule: RuleResult, scoredAt: string): Significance {
  return {
    score: rule.score,
    type: rule.type,
    reason: rule.reason,
    verdict: rule.verdict,
    method: "rule",
    model: null,
    scoredAt,
  };
}

/** Heat percentile gate: is this item's heat inside the batch's top 10%? */
export function top10PercentIds(items: { id: string; heat?: number }[]): Set<string> {
  const out = new Set<string>();
  if (items.length === 0) return out;
  const desc = items
    .map((i) => i.heat ?? 0)
    .slice()
    .sort((a, b) => b - a);
  const idx = Math.max(0, Math.ceil(desc.length * 0.1) - 1);
  const cutoff = desc[idx];
  for (const it of items) if ((it.heat ?? 0) >= cutoff && cutoff > 0) out.add(it.id);
  return out;
}
