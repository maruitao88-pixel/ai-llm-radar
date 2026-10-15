"use client";

import { useEffect, useState } from "react";
import type { AIItem } from "@/lib/types";

const KEY = "ai-search:lastVisit";

export default function NewSince({ items }: { items: AIItem[] }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let last = 0;
    try {
      last = Number(window.localStorage.getItem(KEY) || 0);
    } catch {
      /* storage disabled */
    }
    if (last > 0) {
      const since = items.filter((i) => i.firstSeen && new Date(i.firstSeen).getTime() > last).length;
      setCount(since);
    }
    try {
      window.localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, [items]);

  if (count <= 0) return null;
  return (
    <div className="mb-4 text-sm rounded-lg bg-brand-50 text-brand-700 px-3 py-2 flex items-center justify-between gap-2">
      <span>
        自你上次访问以来，新增 <span className="font-semibold">{count}</span> 条资讯
      </span>
      <button
        onClick={() => setCount(0)}
        aria-label="关闭提示"
        className="shrink-0 text-brand-400 hover:text-brand-600 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}
