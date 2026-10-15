"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getLocale, setLocale as saveLocale, t as translate, type Locale } from "@/lib/i18n";

interface LocaleCtx {
  locale: Locale;
  toggle: () => void;
  t: (key: string) => string;
}

const Ctx = createContext<LocaleCtx>({ locale: "zh", toggle: () => {}, t: (k) => k });

export function useLocale() {
  return useContext(Ctx);
}

export default function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLoc] = useState<Locale>("zh");

  useEffect(() => {
    setLoc(getLocale());
  }, []);

  function toggle() {
    const next: Locale = locale === "zh" ? "en" : "zh";
    saveLocale(next);
    setLoc(next);
  }

  function t(key: string) {
    return translate(key, locale);
  }

  return <Ctx.Provider value={{ locale, toggle, t }}>{children}</Ctx.Provider>;
}
