"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, startTransition } from "react";
import type { CategoryKey, Mode } from "./types";
import { isCategoryKey } from "./categories";

export interface ViewState {
  category: CategoryKey | "all";
  keyword: string;
  mode: Mode;
  since: string;
  source: string;
}

const ALLOWED_SINCE = ["24h", "3d", "7d", "30d"];

const DEFAULT: ViewState = {
  category: "all",
  keyword: "",
  mode: "selected",
  since: "7d",
  source: "",
};

function parseSearch(qs: string): ViewState {
  const sp = new URLSearchParams(qs);
  const cat = sp.get("category") || "";
  return {
    category: isCategoryKey(cat || undefined) ? (cat as CategoryKey) : "all",
    keyword: (sp.get("keyword") || "").trim(),
    mode: sp.get("mode") === "all" ? "all" : "selected",
    since: ALLOWED_SINCE.includes(sp.get("since") || "") ? sp.get("since")! : "7d",
    source: (sp.get("source") || "").trim(),
  };
}

function toQueryString(s: ViewState): string {
  const sp = new URLSearchParams();
  if (s.category !== "all") sp.set("category", s.category);
  if (s.mode !== "selected") sp.set("mode", s.mode);
  if (s.since !== "7d") sp.set("since", s.since);
  if (s.keyword) sp.set("keyword", s.keyword);
  if (s.source) sp.set("source", s.source);
  return sp.toString();
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

interface Ctx {
  state: ViewState;
  update: (patch: Partial<ViewState>) => void;
}

const ViewStateCtx = createContext<Ctx | null>(null);

const FALLBACK: Ctx = {
  state: DEFAULT,
  update: (patch: Partial<ViewState>) => {
    const next = { ...DEFAULT, ...patch };
    const qs = toQueryString(next);
    window.location.href = qs ? `${BASE}/?${qs}` : `${BASE}/`;
  },
};

export function ViewStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(DEFAULT);

  useEffect(() => {
    setState(parseSearch(window.location.search));
  }, []);

  const update = useCallback((patch: Partial<ViewState>) => {
    startTransition(() => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        const qs = toQueryString(next);
        window.history.pushState(null, "", qs ? `${BASE}/?${qs}` : `${BASE}/`);
        return next;
      });
    });
  }, []);

  useEffect(() => {
    const onPop = () => setState(parseSearch(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const value = useMemo(() => ({ state, update }), [state, update]);
  return <ViewStateCtx.Provider value={value}>{children}</ViewStateCtx.Provider>;
}

export function useViewState() {
  const ctx = useContext(ViewStateCtx);
  return ctx ?? FALLBACK;
}
