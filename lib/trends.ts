import type { AIItem, CategoryKey } from "./types";
import { CATEGORIES } from "./categories";
import { ENTITIES, entitiesOf } from "./entities";

export interface DailyCount {
  date: string;
  total: number;
  byCategory: Record<CategoryKey, number>;
}

export interface TopicTrend {
  slug: string;
  name: string;
  counts: { date: string; count: number }[];
  total: number;
}

export function buildDailyCounts(items: AIItem[]): DailyCount[] {
  const map = new Map<string, DailyCount>();
  for (const item of items) {
    const d = (item.publishedAt ?? item.firstSeen ?? "").slice(0, 10);
    if (!d) continue;
    let entry = map.get(d);
    if (!entry) {
      entry = {
        date: d,
        total: 0,
        byCategory: { "ai-models": 0, "ai-products": 0, industry: 0, paper: 0, tip: 0 },
      };
      map.set(d, entry);
    }
    entry.total++;
    if (item.category && item.category in entry.byCategory) {
      entry.byCategory[item.category]++;
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildTopicTrends(items: AIItem[], topN = 8): TopicTrend[] {
  const slugCounts = new Map<string, Map<string, number>>();
  const slugTotals = new Map<string, number>();

  for (const item of items) {
    const d = (item.publishedAt ?? item.firstSeen ?? "").slice(0, 10);
    if (!d) continue;
    for (const slug of entitiesOf(item)) {
      if (!slugCounts.has(slug)) slugCounts.set(slug, new Map());
      const dayMap = slugCounts.get(slug)!;
      dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
      slugTotals.set(slug, (slugTotals.get(slug) ?? 0) + 1);
    }
  }

  const topSlugs = [...slugTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([slug]) => slug);

  return topSlugs.map((slug) => {
    const ent = ENTITIES.find((e) => e.slug === slug);
    const dayMap = slugCounts.get(slug)!;
    const counts = [...dayMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { slug, name: ent?.name ?? slug, counts, total: slugTotals.get(slug) ?? 0 };
  });
}

export const CATEGORY_COLORS: Record<CategoryKey, string> = {
  "ai-models": "#3b6cff",
  "ai-products": "#10b981",
  industry: "#f59e0b",
  paper: "#8b5cf6",
  tip: "#ec4899",
};
