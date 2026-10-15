import type { AIItem } from "./types";

/**
 * 重大事件时间线。
 *
 * 数据只有一个来源（data/items.json）：不再单独生成 milestones.json，
 * 「重大事件」视图直接从条目里筛 significance.verdict === "milestone" 派生，
 * 避免两份数据不同步。
 */

/**
 * 条目归档到哪一天：优先发布日期，其次本系统首次收录时间，
 * 最后退回打分时间。全部缺失或非法时为 null（归入「日期未知」）。
 */
export function milestoneDate(item: AIItem): string | null {
  const raw = item.publishedAt ?? item.firstSeen ?? item.significance?.scoredAt ?? null;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

function dateMs(item: AIItem): number | null {
  const raw = milestoneDate(item);
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

/** "2026-10"；日期缺失或非法时返回 "unknown"。 */
export function milestoneMonthKey(item: AIItem): string {
  const ms = dateMs(item);
  if (ms === null) return "unknown";
  return new Date(ms).toISOString().slice(0, 7);
}

/** "2026-10" -> "2026年10月"；unknown -> "日期未知"。 */
export function milestoneMonthLabel(key: string): string {
  if (key === "unknown") return "日期未知";
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

/**
 * 只保留里程碑条目：日期倒序 -> 同日分数降序 -> 保持原始顺序。
 * 日期未知的条目排在最后。
 */
export function getMilestones(items: AIItem[]): AIItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.significance?.verdict === "milestone")
    .sort((a, b) => {
      const ta = dateMs(a.item);
      const tb = dateMs(b.item);
      if (ta === null && tb !== null) return 1;
      if (tb === null && ta !== null) return -1;
      if (ta !== null && tb !== null && ta !== tb) return tb - ta;
      const sa = a.item.significance?.score ?? 0;
      const sb = b.item.significance?.score ?? 0;
      if (sa !== sb) return sb - sa;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export interface MilestoneGroup {
  key: string;
  label: string;
  items: AIItem[];
}

/** 按月份分组，最新月份在前，「日期未知」在最后。 */
export function buildMilestones(items: AIItem[]): MilestoneGroup[] {
  const groups: MilestoneGroup[] = [];
  const byKey = new Map<string, MilestoneGroup>();
  for (const item of getMilestones(items)) {
    const key = milestoneMonthKey(item);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: milestoneMonthLabel(key), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}