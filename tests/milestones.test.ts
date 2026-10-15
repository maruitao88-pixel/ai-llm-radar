import { describe, expect, it } from "vitest";
import { buildMilestones, getMilestones } from "../lib/milestones";
import type { AIItem } from "../lib/types";

function mk(id: string, publishedAt: string | null, score: number, verdict: "milestone" | "daily" = "milestone", extra: Partial<AIItem> = {}): AIItem {
  return {
    id,
    title: `事件 ${id}`,
    summary: null,
    source: "Source",
    sourceUrl: `https://example.com/${id}`,
    category: null,
    publishedAt,
    significance: {
      score,
      type: "capability",
      reason: "影响点评",
      verdict,
      method: "ai",
      model: "test-model",
      scoredAt: "2026-10-15T00:00:00.000Z",
    },
    ...extra,
  } as AIItem;
}

describe("getMilestones", () => {
  it("returns only milestone-verdict items", () => {
    const items = [
      mk("a", "2026-10-01T00:00:00.000Z", 90),
      mk("b", "2026-10-02T00:00:00.000Z", 99, "daily"),
      { ...mk("c", "2026-10-03T00:00:00.000Z", 80), significance: null },
    ];

    expect(getMilestones(items).map((item) => item.id)).toEqual(["a"]);
  });

  it("sorts by date descending, then score descending, then original order", () => {
    const items = [
      mk("old", "2025-12-01T00:00:00.000Z", 99),
      mk("same-low", "2026-10-02T00:00:00.000Z", 85),
      mk("same-high-first", "2026-10-02T00:00:00.000Z", 95),
      mk("same-high-second", "2026-10-02T00:00:00.000Z", 95),
    ];

    expect(getMilestones(items).map((item) => item.id)).toEqual([
      "same-high-first",
      "same-high-second",
      "same-low",
      "old",
    ]);
  });

  it("uses publishedAt, firstSeen, then scoredAt for missing dates", () => {
    const scoredAtOnly = mk("scored", null, 80, "milestone", {
      firstSeen: null,
      significance: {
        score: 80,
        type: "other",
        reason: "x",
        verdict: "milestone",
        method: "rule",
        model: null,
        scoredAt: "2026-09-01T00:00:00.000Z",
      },
    });
    const firstSeenOnly = mk("seen", null, 80, "milestone", {
      firstSeen: "2026-10-01T00:00:00.000Z",
      significance: {
        score: 80,
        type: "other",
        reason: "x",
        verdict: "milestone",
        method: "rule",
        model: null,
        scoredAt: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(getMilestones([scoredAtOnly, firstSeenOnly]).map((item) => item.id)).toEqual([
      "seen",
      "scored",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(getMilestones([])).toEqual([]);
    expect(buildMilestones([])).toEqual([]);
  });
});

describe("buildMilestones", () => {
  it("groups milestones by month across years and keeps unknown dates last", () => {
    const items = [
      mk("oct", "2026-10-02T00:00:00.000Z", 90),
      mk("sep", "2026-09-30T00:00:00.000Z", 88),
      mk("dec", "2025-12-31T00:00:00.000Z", 91),
      mk("unknown", null, 86, "milestone", { firstSeen: null, significance: {
        score: 86,
        type: "other",
        reason: "x",
        verdict: "milestone",
        method: "rule",
        model: null,
        scoredAt: "not-a-date",
      } }),
    ];

    const groups = buildMilestones(items);
    expect(groups.map((group) => group.key)).toEqual(["2026-10", "2026-09", "2025-12", "unknown"]);
    expect(groups.map((group) => group.label)).toEqual(["2026年10月", "2026年9月", "2025年12月", "日期未知"]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["oct"],
      ["sep"],
      ["dec"],
      ["unknown"],
    ]);
  });
});
