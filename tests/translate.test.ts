import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIItem } from "../lib/types";
import {
  addChineseTitles,
  needsTranslation,
  sortPendingForTranslation,
} from "../scripts/lib/translate";

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

/** Chat-completions reply carrying a JSON array of {id, zh} rows. */
function completion(rows: { id: string; zh: string }[]): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(rows) } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

type StubFetch = (input: string, init: RequestInit) => Promise<Response>;

/** Pull the item ids the code asked the model to translate. */
function requestIds(init: RequestInit): string[] {
  const body = JSON.parse(String(init.body)) as {
    max_tokens: number;
    messages: { role: string; content: string }[];
  };
  const user = JSON.parse(body.messages[1].content) as { items: { id: string }[] };
  return user.items.map((i) => i.id);
}

function requestMaxTokens(init: RequestInit): number {
  return (JSON.parse(String(init.body)) as { max_tokens: number }).max_tokens;
}

function englishBatch(n: number): AIItem[] {
  return Array.from({ length: n }, (_, i) =>
    mk("i" + i, { title: "English headline number " + i }),
  );
}

function translatedIds(items: AIItem[]): string[] {
  return items.filter((i) => i.titleZh).map((i) => i.id);
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("addChineseTitles", () => {
  const KEY = "k-abcdef1234567890";

  it("reserves enough tokens for a full batch of long headlines", async () => {
    let seen = 0;
    const fetchImpl: StubFetch = async (_u, init) => {
      seen = requestMaxTokens(init);
      return completion(requestIds(init).map((id) => ({ id, zh: "\u4e2d\u6587-" + id })));
    };
    await addChineseTitles(englishBatch(12), { apiKey: KEY, fetchImpl, max: 20 });
    expect(seen).toBeGreaterThanOrEqual(2000);
  });

  it("keeps the rows it got and only re-requests the missing ones", async () => {
    const seenSizes: number[] = [];
    const fetchImpl: StubFetch = async (_u, init) => {
      const ids = requestIds(init);
      seenSizes.push(ids.length);
      const keep = ids.length > 6 ? ids.slice(0, 6) : ids;
      return completion(keep.map((id) => ({ id, zh: "\u4e2d\u6587-" + id })));
    };
    const out = await addChineseTitles(englishBatch(12), { apiKey: KEY, fetchImpl, max: 20 });
    expect(translatedIds(out).length).toBe(12);
    expect(seenSizes.some((n) => n < 12)).toBe(true);
  });

  it("splits a failing batch down to single items to isolate a poison headline", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl: StubFetch = async (_u, init) => {
      const ids = requestIds(init);
      if (ids.includes("i0")) {
        // Truncated JSON whenever the un-translatable headline is present.
        const truncated = '[{"id":"i0","zh":"cut';
        return new Response(
          JSON.stringify({ choices: [{ message: { content: truncated } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return completion(ids.map((id) => ({ id, zh: "\u4e2d\u6587-" + id })));
    };
    const out = await addChineseTitles(englishBatch(12), { apiKey: KEY, fetchImpl, max: 20 });
    const done = translatedIds(out);
    expect(done.length).toBe(11);
    expect(done).not.toContain("i0");
  });

  it("logs a redacted diagnostic when a batch keeps failing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl: StubFetch = async () => new Response("upstream boom " + KEY, { status: 503 });
    const out = await addChineseTitles([mk("a", { title: "Some English headline" })], {
      apiKey: KEY,
      fetchImpl,
      max: 5,
    });
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("503");
    expect(logged).not.toContain(KEY);
    expect(translatedIds(out)).toEqual([]);
  });

  it("does not fan out into splits when the transport itself is down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const fetchImpl: StubFetch = async () => {
      calls++;
      throw new Error("network down");
    };
    const out = await addChineseTitles(englishBatch(12), { apiKey: KEY, fetchImpl, max: 20 });
    expect(calls).toBe(2);
    expect(translatedIds(out)).toEqual([]);
  });
});