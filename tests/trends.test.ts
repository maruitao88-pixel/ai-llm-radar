import { describe, it, expect } from "vitest";
import { buildDailyCounts } from "../lib/trends";
import type { AIItem } from "../lib/types";

function makeItem(date: string, category: string = "industry"): AIItem {
  return {
    id: `item-${date}-${Math.random()}`,
    title: "Test",
    summary: null,
    source: "Test",
    sourceUrl: "https://example.com",
    category: category as AIItem["category"],
    publishedAt: `${date}T12:00:00Z`,
  };
}

describe("buildDailyCounts", () => {
  it("groups items by date", () => {
    const items = [
      makeItem("2026-05-28"),
      makeItem("2026-05-28"),
      makeItem("2026-05-29"),
    ];
    const counts = buildDailyCounts(items);
    expect(counts).toHaveLength(2);
    expect(counts.find((c) => c.date === "2026-05-28")?.total).toBe(2);
    expect(counts.find((c) => c.date === "2026-05-29")?.total).toBe(1);
  });

  it("counts by category", () => {
    const items = [
      makeItem("2026-05-28", "ai-models"),
      makeItem("2026-05-28", "ai-models"),
      makeItem("2026-05-28", "paper"),
    ];
    const counts = buildDailyCounts(items);
    expect(counts[0].byCategory["ai-models"]).toBe(2);
    expect(counts[0].byCategory["paper"]).toBe(1);
    expect(counts[0].byCategory["industry"]).toBe(0);
  });

  it("sorts by date ascending", () => {
    const items = [makeItem("2026-05-30"), makeItem("2026-05-28")];
    const counts = buildDailyCounts(items);
    expect(counts[0].date).toBe("2026-05-28");
    expect(counts[1].date).toBe("2026-05-30");
  });

  it("returns empty for no items", () => {
    expect(buildDailyCounts([])).toHaveLength(0);
  });
});
