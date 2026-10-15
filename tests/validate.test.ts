import { describe, expect, it } from "vitest";
import { sanitizeItem, sanitizeItems } from "../lib/validate";
import type { AIItem, Significance } from "../lib/types";

function mk(partial: Partial<AIItem>): AIItem {
  return {
    id: "x-1",
    title: "A valid title",
    summary: null,
    source: "TechCrunch",
    sourceUrl: "https://example.com/a",
    category: null,
    publishedAt: "2026-07-20T10:00:00.000Z",
    ...partial,
  } as AIItem;
}

describe("sanitizeItem", () => {
  it("passes a normal item through unchanged", () => {
    const it_ = sanitizeItem(mk({ heat: 42, summary: "ok" }));
    expect(it_).not.toBeNull();
    expect(it_!.heat).toBe(42);
    expect(it_!.summary).toBe("ok");
  });

  it("drops items with dangerous url protocols", () => {
    expect(sanitizeItem(mk({ sourceUrl: "javascript:alert(1)" }))).toBeNull();
    expect(sanitizeItem(mk({ sourceUrl: "data:text/html,x" }))).toBeNull();
    expect(sanitizeItem(mk({ sourceUrl: "//evil.com/x" }))).toBeNull();
  });

  it("drops items missing required fields", () => {
    expect(sanitizeItem(mk({ title: "   " }))).toBeNull();
    expect(sanitizeItem(mk({ id: "" }))).toBeNull();
    expect(sanitizeItem(mk({ source: "" }))).toBeNull();
  });

  it("clamps oversized fields instead of dropping", () => {
    const it_ = sanitizeItem(mk({ title: "t".repeat(9999), summary: "s".repeat(99999) }));
    expect(it_!.title.length).toBe(300);
    expect(it_!.summary!.length).toBe(2000);
  });

  it("forces image to https and rejects http image", () => {
    expect(sanitizeItem(mk({ image: "http://x.com/a.png" }))!.image).toBeNull();
    expect(sanitizeItem(mk({ image: "https://x.com/a.png" }))!.image).toBe("https://x.com/a.png");
  });

  it("normalizes bogus heat and dates", () => {
    const it_ = sanitizeItem(mk({ heat: Number.NaN, publishedAt: "not-a-date" }));
    expect(it_!.heat).toBe(0);
    expect(it_!.publishedAt).toBeNull();
    expect(sanitizeItem(mk({ heat: -5 }))!.heat).toBe(0);
  });
});

describe("sanitizeItems", () => {
  it("drops invalid entries and reports the count", () => {
    const { items, dropped } = sanitizeItems([
      mk({}),
      mk({ id: "x-2", sourceUrl: "javascript:void(0)" }),
      mk({ id: "x-3" }),
    ]);
    expect(items).toHaveLength(2);
    expect(dropped).toBe(1);
  });
});

function mkSig(partial: Partial<Significance> = {}): Significance {
  return {
    score: 85,
    type: "model-release",
    reason: "旗舰模型发布",
    verdict: "milestone",
    method: "ai",
    model: "deepseek-chat",
    scoredAt: "2026-10-15T02:00:00.000Z",
    ...partial,
  };
}

describe("sanitizeSignificance (via sanitizeItem)", () => {
  it("keeps a valid significance record", () => {
    const it_ = sanitizeItem(mk({ significance: mkSig() }));
    expect(it_!.significance).toEqual(mkSig());
  });

  it("omits significance when absent", () => {
    expect(sanitizeItem(mk({}))!.significance).toBeNull();
  });

  it("rejects a whole record when a field is invalid", () => {
    expect(sanitizeItem(mk({ significance: mkSig({ type: "bogus" as never }) }))!.significance).toBeNull();
    expect(sanitizeItem(mk({ significance: mkSig({ verdict: "maybe" as never }) }))!.significance).toBeNull();
    expect(sanitizeItem(mk({ significance: mkSig({ method: "guess" as never }) }))!.significance).toBeNull();
    expect(sanitizeItem(mk({ significance: mkSig({ scoredAt: "not-a-date" }) }))!.significance).toBeNull();
    expect(sanitizeItem(mk({ significance: mkSig({ reason: 42 as never }) }))!.significance).toBeNull();
  });

  it("clamps score and reason length", () => {
    const hi = sanitizeItem(mk({ significance: mkSig({ score: 999, reason: "字".repeat(200) }) }))!;
    expect(hi.significance!.score).toBe(100);
    expect(hi.significance!.reason.length).toBe(60);

    const lo = sanitizeItem(mk({ significance: mkSig({ score: -10 }) }))!;
    expect(lo.significance!.score).toBe(0);
  });

  it("preserves a stored verdict verbatim", () => {
    const it_ = sanitizeItem(mk({ significance: mkSig({ score: 10, verdict: "milestone" }) }))!;
    expect(it_!.significance!.verdict).toBe("milestone");
  });

  it("accepts a null model for rule scoring", () => {
    const it_ = sanitizeItem(mk({ significance: mkSig({ method: "rule", model: null }) }))!;
    expect(it_!.significance!.model).toBeNull();
  });
});