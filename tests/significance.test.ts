import { describe, expect, it } from "vitest";
import {
  clampScore,
  parseSignificanceResponse,
  ruleScore,
  verdictFor,
} from "../lib/significance";
import { addSignificance } from "../scripts/lib/significance";
import type { AIItem } from "../lib/types";

function mk(partial: Partial<AIItem> = {}): AIItem {
  return {
    id: "item-1",
    title: "OpenAI 发布新一代旗舰模型",
    summary: "官方宣布模型发布并刷新 SOTA",
    source: "OpenAI",
    sourceUrl: "https://example.com/openai",
    category: "model",
    publishedAt: "2026-10-15T01:00:00.000Z",
    heat: 90,
    tier: 1,
    fetchedAt: "2026-10-15T02:00:00.000Z",
    ...partial,
  } as AIItem;
}

describe("significance parsing", () => {
  it("parses a plain JSON response", () => {
    const parsed = parseSignificanceResponse(
      JSON.stringify({
        score: 88,
        type: "model-release",
        reason: "旗舰模型发布，影响行业竞争格局",
        aiNote: "值得关注",
      }),
    );

    expect(parsed).toEqual({
      score: 88,
      type: "model-release",
      reason: "旗舰模型发布，影响行业竞争格局",
      aiNote: "值得关注",
    });
  });

  it("parses a response wrapped in a markdown code fence", () => {
    const parsed = parseSignificanceResponse(
      "```json\n{\"score\":81,\"type\":\"capability\",\"reason\":\"推理能力突破\",\"aiNote\":\"能力边界推进\"}\n```",
    );

    expect(parsed?.score).toBe(81);
    expect(parsed?.type).toBe("capability");
  });

  it("clamps out-of-range scores", () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(120)).toBe(100);
    expect(parseSignificanceResponse("{\"score\":-10,\"type\":\"other\",\"reason\":\"x\",\"aiNote\":\"y\"}")?.score).toBe(0);
    expect(parseSignificanceResponse("{\"score\":120,\"type\":\"other\",\"reason\":\"x\",\"aiNote\":\"y\"}")?.score).toBe(100);
  });

  it("tolerates missing or invalid type and reason fields", () => {
    const parsed = parseSignificanceResponse(
      JSON.stringify({ score: 85, type: 123, reason: { text: "bad" } }),
    );

    expect(parsed?.type).toBe("other");
    expect(parsed?.reason).toBe("");
    expect(parseSignificanceResponse(JSON.stringify({ type: "other", reason: "x" }))).toBeNull();
  });
});

describe("significance thresholding", () => {
  it("uses the threshold boundary exactly", () => {
    expect(verdictFor(79, 80)).toBe("daily");
    expect(verdictFor(80, 80)).toBe("milestone");
  });
});

describe("rule fallback scoring", () => {
  const now = new Date("2026-10-15T03:00:00.000Z");

  it("turns a tier-1 item with a major keyword into a 70-point daily item", () => {
    const result = ruleScore(
      { tier: 1, text: "官方发布新模型", hotTop10Percent: false, sourceCount: 1 },
      { now, threshold: 80 },
    );

    expect(result.score).toBe(70);
    expect(result.verdict).toBe("daily");
    expect(result.method).toBe("rule");
    expect(result.type).toBe("model-release");
  });

  it("adds heat and multi-source signals and promotes the item", () => {
    const result = ruleScore(
      { tier: 1, text: "官方发布新模型并刷新 SOTA", hotTop10Percent: true, sourceCount: 3 },
      { now, threshold: 80 },
    );

    expect(result.score).toBe(100);
    expect(result.verdict).toBe("milestone");
  });

  it("caps all rule signals at 100", () => {
    const result = ruleScore(
      { tier: 1, text: "发布 SOTA 开源权重 融资 billion 监管", hotTop10Percent: true, sourceCount: 8 },
      { now, threshold: 80 },
    );

    expect(result.score).toBe(100);
  });

  it("does not promote a tier-1 item without a major keyword", () => {
    const result = ruleScore(
      { tier: 1, text: "常规产品更新", hotTop10Percent: false, sourceCount: 1 },
      { now, threshold: 80 },
    );

    expect(result.score).toBe(40);
    expect(result.verdict).toBe("daily");
  });
});

describe("addSignificance without an API key", () => {
  it("scores every item with rules and never throws", async () => {
    const items = [
      mk({ id: "a" }),
      mk({ id: "b", title: "普通教程", summary: "如何调用模型", tier: 3, heat: 1 }),
    ];

    const out = await addSignificance(items, {
      apiKey: null,
      threshold: 80,
      now: new Date("2026-10-15T03:00:00.000Z"),
    });

    expect(out).toHaveLength(2);
    expect(out.every((item) => item.significance?.method === "rule")).toBe(true);
    expect(out.every((item) => typeof item.significance?.score === "number")).toBe(true);
  });

  it("keeps an existing score instead of re-scoring it", async () => {
    const existing = {
      score: 91,
      type: "policy" as const,
      reason: "已有评分",
      verdict: "milestone" as const,
      method: "ai" as const,
      model: "test-model",
      scoredAt: "2026-10-14T00:00:00.000Z",
    };
    const out = await addSignificance([mk({ significance: existing })], {
      apiKey: null,
      now: new Date("2026-10-15T03:00:00.000Z"),
    });

    expect(out[0].significance).toEqual(existing);
  });
});
