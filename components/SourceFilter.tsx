"use client";

import { useState, useCallback, useEffect } from "react";
import { useLocale } from "./LocaleProvider";
import { useViewState } from "@/lib/viewState";

export default function SourceFilter({
  sources,
  activeSources,
}: {
  sources: [string, number][];
  activeSources: string[];
}) {
  const { t } = useLocale();
  const { update } = useViewState();
  const [selected, setSelected] = useState<Set<string>>(new Set(activeSources));

  useEffect(() => setSelected(new Set(activeSources)), [activeSources]);

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      update({ source: [...next].join(",") });
      return next;
    });
  }, [update]);

  const clearAll = useCallback(() => {
    setSelected(new Set());
    update({ source: "" });
  }, [update]);

  return (
    <>
      <ul className="space-y-0.5 max-h-72 overflow-y-auto scroll-hide -mx-1">
        {sources.map(([name, n]) => {
          const active = selected.has(name);
          return (
            <li key={name}>
              <button
                onClick={() => toggle(name)}
                className={
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors duration-150 " +
                  (active
                    ? "bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-500 font-medium"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800")
                }
              >
                <span
                  className={
                    "w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors " +
                    (active
                      ? "bg-brand-500 border-brand-500"
                      : "border-gray-300 dark:border-gray-600")
                  }
                >
                  {active && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="truncate flex-1">{name}</span>
                <span className={"shrink-0 text-xs tabular-nums " + (active ? "text-brand-500" : "text-gray-400")}>
                  {n}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selected.size > 0 && (
        <button
          onClick={clearAll}
          className="mt-2 text-xs text-brand-600 dark:text-brand-500 hover:underline"
        >
          {t("sidebar.sources.clear")} ({selected.size})
        </button>
      )}
    </>
  );
}
