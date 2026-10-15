import type { AIItem } from "./types";

export interface TimelineDay {
  date: string;
  highlights: AIItem[];
}

export function buildTimeline(items: AIItem[], maxDays = 30): TimelineDay[] {
  const dayMap = new Map<string, AIItem[]>();

  for (const item of items) {
    const d = (item.publishedAt ?? item.firstSeen ?? "").slice(0, 10);
    if (!d) continue;
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push(item);
  }

  return [...dayMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, maxDays)
    .map(([date, dayItems]) => ({
      date,
      highlights: dayItems
        .sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0))
        .slice(0, 5),
    }));
}
