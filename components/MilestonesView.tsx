"use client";

import { useMemo, useState } from "react";
import MilestoneTimeline from "./MilestoneTimeline";
import { useLocale } from "./LocaleProvider";
import type { MilestoneGroup } from "@/lib/milestones";
import type { AIItem, EventType } from "@/lib/types";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/significance";

/**
 * /milestones 的筛选视图。数据由服务端从 items.json 派生后传入，
 * 这里只做事件类型 + 年份的前端筛选，状态存在 sessionStorage 里，
 * 距离返回首页/刷新不丢筛选条件。
 */

const FILTER_KEY = "ai-search:milestones-filter";

interface FilterState {
  type: EventType | "all";
  year: string | "all";
}

function readFilter(): FilterState {
  if (typeof window === "undefined") return { type: "all", year: "all" };
  try {
    const raw = window.sessionStorage.getItem(FILTER_KEY);
    if (!raw) return { type: "all", year: "all" };
    const parsed = JSON.parse(raw) as Partial<FilterState>;
    const type =
      parsed.type && (parsed.type === "all" || (EVENT_TYPES as readonly string[]).includes(parsed.type))
        ? (parsed.type as EventType | "all")
        : "all";
    const year = typeof parsed.year === "string" ? parsed.year : "all";
    return { type, year };
  } catch {
    return { type: "all", year: "all" };
  }
}

function writeFilter(state: FilterState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode) — filtering still works in memory
  }
}

function milestoneYear(item: AIItem): string | null {
  const raw = item.publishedAt ?? item.firstSeen ?? item.significance?.scoredAt ?? null;
  if (typeof raw !== "string" || raw.length === 0) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : String(new Date(ms).getUTCFullYear());
}

function filterButtonClass(active: boolean): string {
  const base =
    "px-3 py-1.5 rounded-full border text-xs font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 active:scale-[0.97]";
  return active
    ? base + " border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-500"
    : base +
      " border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500";
}

export default function MilestonesView({
  groups,
  threshold,
}: {
  groups: MilestoneGroup[];
  threshold: number;
}) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<FilterState>(() => readFilter());

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const group of groups) {
      for (const item of group.items) {
        const year = milestoneYear(item);
        if (year) set.add(year);
      }
    }
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [groups]);

  // Guard against a stale session filter pointing at a year/type that no longer exists.
  const activeType: EventType | "all" =
    filter.type === "all" || (EVENT_TYPES as readonly string[]).includes(filter.type) ? filter.type : "all";
  const activeYear = filter.year === "all" || years.includes(filter.year) ? filter.year : "all";

  const filtered = useMemo(() => {
    const match = (item: AIItem) =>
      (activeType === "all" || item.significance?.type === activeType) &&
      (activeYear === "all" || milestoneYear(item) === activeYear);

    const out: { group: MilestoneGroup; sortKey: number }[] = [];
    for (const group of groups) {
      const kept = group.items.filter(match);
      if (kept.length === 0) continue;
      const first = kept[0];
      const parsed = Date.parse(
        first.publishedAt ?? first.firstSeen ?? first.significance?.scoredAt ?? "",
      );
      out.push({
        group: { key: group.key, label: group.label, items: kept },
        sortKey: Number.isNaN(parsed) ? 0 : parsed,
      });
    }
    // Re-sort by month so a year filter keeps the newest month on top.
    out.sort((a, b) => b.sortKey - a.sortKey);
    return out.map((entry) => entry.group);
  }, [groups, activeType, activeYear]);

  function update(next: Partial<FilterState>) {
    setFilter((prev) => {
      const merged: FilterState = { ...prev, ...next };
      writeFilter(merged);
      return merged;
    });
  }

  const isEmpty = groups.length === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6">
      <aside>
        <div className="lg:sticky lg:top-20 space-y-4">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t("milestones.typeAll")}
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={activeType === "all"}
                onClick={() => update({ type: "all" })}
                className={filterButtonClass(activeType === "all")}
              >
                {t("stories.filter.all")}
              </button>
              {EVENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={activeType === type}
                  onClick={() => update({ type })}
                  className={filterButtonClass(activeType === type)}
                >
                  {EVENT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {years.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t("milestones.yearAll")}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={activeYear === "all"}
                  onClick={() => update({ year: "all" })}
                  className={filterButtonClass(activeYear === "all")}
                >
                  {t("milestones.yearAll")}
                </button>
                {years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={activeYear === year}
                    onClick={() => update({ year })}
                    className={filterButtonClass(activeYear === year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {t("milestones.threshold")} ≥ {threshold}
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        {(!isEmpty && filtered.length > 0) && (
          <p className="mb-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums">
            {filtered.reduce((n, group) => n + group.items.length, 0)} {t("milestones.summary")}
          </p>
        )}
        {isEmpty || filtered.length === 0 ? (
          <p className="card p-4 text-sm leading-relaxed text-gray-400 dark:text-gray-500">
            {isEmpty ? t("milestones.empty") : t("milestones.filter.empty")}
            {isEmpty && (
              <span className="block mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                {t("milestones.threshold")} ≥ {threshold}
              </span>
            )}
          </p>
        ) : (
          <MilestoneTimeline variant="full" groups={filtered} threshold={threshold} />
        )}
      </div>
    </div>
  );
}