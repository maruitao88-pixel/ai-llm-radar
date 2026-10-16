import { describe, expect, it } from "vitest";
import type { AIItem } from "../lib/types";
import { needsTranslation, sortPendingForTranslation } from "../scripts/lib/translate";

function mk(id: string, extra: Partial<AIItem> = {}): AIItem {
  return {
    id,
    title: "x",
    summary: null,
    source: "src",
    sourceUrl: "https://example.com/" + id,
    category: null,
    publishedAt: null,
    ...extra,
  };
}

describe("needsTranslation", () => {
  it("flags English headlines", () => {
    expect(needsTranslation("How the Claude Code team does code review")).toBe(true);
  });

  it("accepts headlines that already read as Chinese", () => {
    expect(needsTranslation("\u4e2d\u6587\u6807\u9898")).toBe(false);
  });

  it("treats a single stray CJK glyph as still English", () => {
    expect(needsTranslation("New model from \u5b57")).toBe(true);
  });
});

describe("sortPendingForTranslation", () => {
  it("puts the newest headline first even when it is colder", () => {
    const older = mk("old", { publishedAt: "2026-10-01T00:00:00Z", heat: 99 });
    const fresh = mk("fresh", { publishedAt: "2026-10-16T00:00:00Z", heat: 1 });
    expect(sortPendingForTranslation([older, fresh]).map((i) => i.id)).toEqual(["fresh", "old"]);
  });

  it("falls back to firstSeen when publishedAt is missing", () => {
    const a = mk("a", { publishedAt: null, firstSeen: "2026-10-15T00:00:00Z", heat: 5 });
    const b = mk("b", { publishedAt: "2026-10-14T00:00:00Z", heat: 5 });
    expect(sortPendingForTranslation([b, a]).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("uses heat to break ties at the same timestamp", () => {
    const cold = mk("cold", { publishedAt: "2026-10-16T00:00:00Z", heat: 3 });
    const hot = mk("hot", { publishedAt: "2026-10-16T00:00:00Z", heat: 80 });
    expect(sortPendingForTranslation([cold, hot]).map((i) => i.id)).toEqual(["hot", "cold"]);
  });

  it("keeps undated items last and does not mutate the input", () => {
    const undated = mk("undated", { heat: 100 });
    const dated = mk("dated", { publishedAt: "2026-10-16T00:00:00Z", heat: 1 });
    const input = [undated, dated];
    expect(sortPendingForTranslation(input).map((i) => i.id)).toEqual(["dated", "undated"]);
    expect(input.map((i) => i.id)).toEqual(["undated", "dated"]);
  });
});
