"use client";

import { memo } from "react";
import Link from "next/link";
import type { AIItem } from "@/lib/types";
import type { MilestoneGroup } from "@/lib/milestones";
import { EVENT_TYPE_LABELS } from "@/lib/significance";
import { useLocale } from "./LocaleProvider";

/**
 * 重大事件时间线。
 *
 * 数据由 lib/milestones.ts 从 items.json 派生（significance.verdict === "milestone"），
 * 不依赖额外的数据文件。compact 用在首页右栏，full 用在 /milestones 页面。
 */

function dateLabel(item: AIItem): string {
  const raw = item.publishedAt ?? item.firstSeen ?? item.significance?.scoredAt ?? null;
  if (typeof raw !== "string" || raw.length === 0) return "";
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

function MilestoneEntry({ item }: { item: AIItem }) {
  const sig = item.significance;
  const typeLabel = sig ? EVENT_TYPE_LABELS[sig.type] : null;
  const detail = sig?.reason || item.aiNote || item.summary;
  const date = dateLabel(item);

  return (
    <li className="relative pl-11">
      <span
        className="absolute left-[18px] top-4 w-[11px] h-[11px] rounded-full bg-brand-500 border-2 border-white dark:border-gray-900"
        aria-hidden="true"
      />
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="card group block p-3"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
          {typeLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-500/20 text-brand-600 dark:text-brand-500 font-medium shrink-0">
              {typeLabel}
            </span>
          )}
          <span className="text-[11px] text-gray-400 shrink-0">{item.source}</span>
          {date && <span className="text-[11px] text-gray-400 shrink-0">{date}</span>}
          {sig && (
            <span className="ml-auto text-[11px] text-gray-400 tabular-nums shrink-0">
              {sig.score}
            </span>
          )}
        </div>
        <h3 className="text-sm font-medium leading-snug text-gray-800 dark:text-gray-200 group-hover:text-brand-600 line-clamp-2">
          {item.title}
        </h3>
        {detail && (
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">
            {detail}
          </p>
        )}
      </a>
    </li>
  );
}

function TimelineList({ items }: { items: AIItem[] }) {
  return (
    <div className="relative animate-fadeIn">
      <span
        className="absolute left-[23px] top-1 bottom-6 w-px bg-gray-200 dark:bg-gray-700"
        aria-hidden="true"
      />
      <ol className="space-y-2.5">
        {items.map((item) => (
          <MilestoneEntry key={item.id} item={item} />
        ))}
      </ol>
    </div>
  );
}

function EmptyState({ threshold, compact }: { threshold: number; compact: boolean }) {
  const { t } = useLocale();
  return (
    <p className={compact ? "text-xs leading-relaxed text-gray-400 dark:text-gray-500" : "card p-4 text-sm leading-relaxed text-gray-400 dark:text-gray-500"}>
      {t("milestones.empty")}
      <span className="block mt-1 text-[11px] text-gray-400 dark:text-gray-500">
        {t("milestones.threshold")} ≥ {threshold}
      </span>
    </p>
  );
}

export default memo(function MilestoneTimeline({
  groups,
  variant = "full",
  limit,
  threshold = 80,
  className = "",
}: {
  groups: MilestoneGroup[];
  variant?: "compact" | "full";
  limit?: number;
  threshold?: number;
  className?: string;
}) {
  const { t } = useLocale();
  const flat = groups.flatMap((group) => group.items);
  const isCompact = variant === "compact";

  if (isCompact) {
    const shown = typeof limit === "number" ? flat.slice(0, limit) : flat;
    return (
      <section className={"card p-4 " + className} aria-label={t("milestones.title")}>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {t("milestones.title")}
          </h2>
          <Link
            href="/milestones"
            className="shrink-0 text-[11px] text-brand-600 dark:text-brand-500 hover:underline"
          >
            {t("milestones.viewAll")}
          </Link>
        </div>
        {shown.length > 0 ? (
          <TimelineList items={shown} />
        ) : (
          <EmptyState threshold={threshold} compact />
        )}
      </section>
    );
  }

  if (flat.length === 0) {
    return (
      <div className={className}>
        <EmptyState threshold={threshold} compact={false} />
      </div>
    );
  }

  return (
    <div className={"space-y-8 " + className}>
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {group.label}
            <span className="ml-2 text-[11px] font-normal text-gray-400 dark:text-gray-500">
              {group.items.length}
            </span>
          </h2>
          <TimelineList items={group.items} />
        </section>
      ))}
    </div>
  );
});

