"use client";

import { memo, useEffect, useMemo, useState, useDeferredValue } from "react";
import Link from "next/link";
import ItemList from "./ItemList";
import PersonalizeModal from "./PersonalizeModal";
import { filterItems } from "@/lib/filter";
import { buildHref } from "@/lib/href";
import { personalize, sourcesFromItems } from "@/lib/personalize";
import { hasPersonalization, useUserStore } from "@/lib/userStore";
import { useLocale } from "./LocaleProvider";
import type { AIItem, CategoryKey, Mode } from "@/lib/types";

const PAGE_SIZE = 12;
const TODAY_WINDOW_MS = 24 * 60 * 60 * 1000;
type ViewKey = "all" | "today" | "bookmarks" | "unread";

export interface FeedQuery {
  mode: Mode;
  category: CategoryKey | "all";
  since: string;
  keyword: string;
  source: string;
}

export default memo(function FeedSection({
  items,
  query,
  now,
}: {
  items: AIItem[];
  query: FeedQuery;
  now: number;
}) {
  const { t } = useLocale();
  const { state, hydrated, toggleBookmark, markRead, toggleFollowSource, toggleMuteSource, toggleTopic, clearAll } =
    useUserStore();
  const deferredQuery = useDeferredValue(query);
  const isStale = deferredQuery !== query;
  const [view, setView] = useState<ViewKey>("all");
  const [sort, setSort] = useState<"latest" | "heat">("latest");
  const [page, setPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function exportBookmarks() {
    const md = items
      .filter((i) => state.bookmarks.includes(i.id))
      .map((i) => `- [${i.title}](${i.sourceUrl}) — ${i.source}`)
      .join("\n");
    if (!md || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    setPage(1);
  }, [deferredQuery.mode, deferredQuery.category, deferredQuery.since, deferredQuery.keyword, deferredQuery.source, view, sort]);

  const base = useMemo(
    () => filterItems(items, { ...deferredQuery, sort }),
    [items, deferredQuery, sort],
  );
  const personalized = useMemo(
    () => (hydrated ? personalize(base, state) : base),
    [base, hydrated, state],
  );
  const bookmarks = useMemo(() => new Set(state.bookmarks), [state.bookmarks]);
  const readSet = useMemo(() => new Set(state.read), [state.read]);

  const todayCount = useMemo(
    () => base.filter((i) => i.firstSeen && now - new Date(i.firstSeen).getTime() < TODAY_WINDOW_MS).length,
    [base, now],
  );

  const viewed = useMemo(() => {
    if (view === "today")
      return personalized.filter((i) => i.firstSeen && now - new Date(i.firstSeen).getTime() < TODAY_WINDOW_MS);
    if (view === "bookmarks") return personalized.filter((i) => bookmarks.has(i.id));
    if (view === "unread") return personalized.filter((i) => !readSet.has(i.id));
    return personalized;
  }, [personalized, view, bookmarks, readSet, now]);

  const sources = useMemo(() => sourcesFromItems(items), [items]);

  const totalPages = Math.max(1, Math.ceil(viewed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = viewed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const views: { key: ViewKey; label: string }[] = [
    { key: "all", label: t("feed.all") },
    { key: "today", label: todayCount ? `${t("feed.today")} ${todayCount}` : t("feed.today") },
    { key: "bookmarks", label: hydrated && state.bookmarks.length ? `${t("feed.bookmarks")} ${state.bookmarks.length}` : t("feed.bookmarks") },
    { key: "unread", label: t("feed.unread") },
  ];

  const tab = (active: boolean) =>
    "px-3 h-8 inline-flex items-center rounded-md text-sm transition " +
    (active ? "bg-brand-500 text-white" : "text-gray-600 dark:text-gray-300 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-gray-800");

  return (
    <>
      <div className={"flex items-center justify-between gap-3 flex-wrap mb-4" + (isStale ? " opacity-60 transition-opacity" : "")}>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
          <span>
            {t("feed.showing")} <span className="text-gray-800 dark:text-gray-200 font-medium">{viewed.length}</span> {t("feed.items")}
          </span>
          {deferredQuery.source && (
            <Link
              href={buildHref({ category: deferredQuery.category, mode: deferredQuery.mode, since: deferredQuery.since, keyword: deferredQuery.keyword })}
              scroll={false}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-500 border border-brand-100 dark:border-brand-500/30 hover:bg-brand-100 dark:hover:bg-brand-500/30"
            >
              {t("feed.source")}：{deferredQuery.source.split(",").length > 1 ? `${deferredQuery.source.split(",").length} 个` : deferredQuery.source} <span className="text-brand-400">✕</span>
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {(["latest", "heat"] as const).map((k) => (
              <button key={k} onClick={() => setSort(k)} className={tab(sort === k)}>
                {k === "latest" ? t("feed.latest") : t("feed.hottest")}
              </button>
            ))}
          </div>
          <span className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-1 flex-wrap">
            {views.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)} className={tab(view === v.key)}>
                {v.label}
              </button>
            ))}
          </div>
          {hydrated && state.bookmarks.length > 0 && (
            <button
              onClick={exportBookmarks}
              className="px-3 h-8 inline-flex items-center rounded-md text-sm border border-gray-200 text-gray-600 hover:border-brand-500 transition"
            >
              {copied ? t("feed.exported") : t("feed.export")}
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className={
              "px-3 h-8 inline-flex items-center rounded-md text-sm border transition " +
              (hydrated && hasPersonalization(state)
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-gray-200 text-gray-600 hover:border-brand-500")
            }
          >
            {t("feed.personalize")}{hydrated && hasPersonalization(state) ? " ·" : ""}
          </button>
        </div>
      </div>

      <ItemList
        items={pageItems}
        bookmarks={bookmarks}
        readSet={readSet}
        now={now}
        keyword={deferredQuery.keyword}
        onToggleBookmark={toggleBookmark}
        onOpen={markRead}
        emptyHint={
          view === "bookmarks"
            ? t("feed.empty.bookmarks")
            : view === "today"
              ? t("feed.empty.today")
              : view === "unread"
                ? t("feed.empty.unread")
                : t("feed.empty.default")
        }
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(safePage - 1)}
            disabled={safePage <= 1}
            className="min-w-[36px] h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm hover:border-brand-500 disabled:opacity-40"
          >
            {t("feed.prevPage")}
          </button>
          <span className="text-sm text-gray-500 px-2">
            {safePage} / {totalPages}
          </span>
          <button
            onClick={() => {
              setPage(safePage + 1);
              if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={safePage >= totalPages}
            className="min-w-[36px] h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm hover:border-brand-500 disabled:opacity-40"
          >
            {t("feed.nextPage")}
          </button>
        </div>
      )}

      <PersonalizeModal
        open={settingsOpen}
        sources={sources}
        state={state}
        onToggleFollowSource={toggleFollowSource}
        onToggleMuteSource={toggleMuteSource}
        onToggleTopic={toggleTopic}
        onClear={clearAll}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
})
