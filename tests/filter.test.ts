import { describe, it, expect } from "vitest";
import { filterItems, sinceForWindow } from "../lib/filter";
import type { AIItem } from "../lib/types";

function makeItem(overrides: Partial<AIItem> = {}): AIItem {
  return {
    id: "test-1",
    title: "Test Item",
    summary: null,
    source: "TestSource",
    sourceUrl: "https://example.com",
    category: "industry",
    publishedAt: "2026-05-30T12:00:00Z",
    ...overrides,
  };
}

describe("sinceForWindow", () => {
  it("parses day-based windows", () => {
    const iso = sinceForWindow("7d");
    expect(iso).toBeDefined();
    const diff = Date.now() - new Date(iso!).getTime();
    expect(diff).toBeGreaterThan(6 * 86400000);
    expect(diff).toBeLessThan(8 * 86400000);
  });

  it("parses hour-based windows", () => {
    const iso = sinceForWindow("24h");
    expect(iso).toBeDefined();
    const diff = Date.now() - new Date(iso!).getTime();
    expect(diff).toBeGreaterThan(23 * 3600000);
    expect(diff).toBeLessThan(25 * 3600000);
  });

  it("returns undefined for empty input", () => {
    expect(sinceForWindow(undefined)).toBeUndefined();
    expect(sinceForWindow("")).toBeUndefined();
  });
});

describe("filterItems", () => {
  const items: AIItem[] = [
    makeItem({ id: "1", title: "OpenAI GPT-5", category: "ai-models", heat: 100, aiSelected: true }),
    makeItem({ id: "2", title: "React 20 released", category: "tip", heat: 50, aiSelected: true }),
    makeItem({ id: "3", title: "AI regulation bill", category: "industry", heat: 200, aiSelected: false }),
    makeItem({ id: "4", title: "LLM paper", category: "paper", heat: 10, aiSelected: true, source: "arXiv" }),
  ];

  it("filters by category", () => {
    const result = filterItems(items, { category: "ai-models" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters out aiSelected=false in selected mode", () => {
    const result = filterItems(items, { mode: "selected" });
    expect(result).toHaveLength(3);
    expect(result.find((i) => i.id === "3")).toBeUndefined();
  });

  it("includes all in mode=all", () => {
    const result = filterItems(items, { mode: "all" });
    expect(result).toHaveLength(4);
  });

  it("filters by keyword", () => {
    const result = filterItems(items, { mode: "all", keyword: "openai" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("filters by source", () => {
    const result = filterItems(items, { mode: "all", source: "arXiv" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("4");
  });

  it("sorts by heat", () => {
    const result = filterItems(items, { mode: "all", sort: "heat" });
    expect(result[0].id).toBe("3");
    expect(result[1].id).toBe("1");
  });

  it("sorts by latest by default", () => {
    const result = filterItems(items, { mode: "all", sort: "latest" });
    expect(result[0].publishedAt).toBe("2026-05-30T12:00:00Z");
  });
});
