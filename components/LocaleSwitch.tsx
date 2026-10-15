"use client";

import { useLocale } from "./LocaleProvider";

export default function LocaleSwitch() {
  const { locale, toggle } = useLocale();

  return (
    <button
      onClick={toggle}
      className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-500 hover:text-brand-600 transition"
      title={locale === "zh" ? "Switch to English" : "切换到中文"}
    >
      {locale === "zh" ? "EN" : "中"}
    </button>
  );
}
