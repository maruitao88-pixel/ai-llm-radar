"use client";

import { CATEGORIES } from "@/lib/categories";
import type { CategoryKey } from "@/lib/types";
import { useLocale } from "./LocaleProvider";
import { useViewState } from "@/lib/viewState";

export default function CategoryNav() {
  const { t } = useLocale();
  const { state, update } = useViewState();
  const tabs: { key: CategoryKey | "all"; label: string }[] = [
    { key: "all", label: t("cat.all") },
    ...CATEGORIES.map((c) => ({ key: c.key, label: t(`cat.${c.key}`) })),
  ];

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto scroll-hide">
        {tabs.map((tab) => {
          const isActive = state.category === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => update({ category: tab.key })}
              className={
                "shrink-0 px-3 h-11 flex items-center text-sm border-b-2 transition-colors duration-150 " +
                (isActive
                  ? "border-brand-500 text-brand-600 dark:text-brand-500 font-medium"
                  : "border-transparent text-gray-600 dark:text-gray-300 hover:text-brand-600")
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
