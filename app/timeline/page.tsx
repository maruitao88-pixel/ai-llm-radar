import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import { readArchive } from "@/lib/archive";
import { readLocalItems } from "@/lib/localStore";
import { buildTimeline } from "@/lib/timeline";
import { CATEGORY_MAP } from "@/lib/categories";
import { abs } from "@/lib/seo";

export const metadata: Metadata = {
  title: "时间线",
  description: "AI 行业大事时间线：按日回顾每天最重要的 AI 资讯。",
  alternates: { canonical: abs("/timeline") },
};

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00");
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return { full: d, month: d.slice(5, 7), day: d.slice(8, 10), weekday: `周${weekday}` };
}

export default function TimelinePage() {
  const archive = readArchive();
  const items = archive.length > 0 ? archive : readLocalItems();
  const timeline = buildTimeline(items, 30);

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-brand-600">← 返回首页</Link>
        </div>
        <h1 className="text-2xl font-bold dark:text-gray-100 mb-1">时间线</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          每天精选最重要的 AI 资讯，共 {timeline.length} 天
        </p>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[23px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />

          {timeline.map((day) => {
            const d = formatDate(day.date);
            return (
              <div key={day.date} className="relative pl-14 pb-8">
                {/* Date dot */}
                <div className="absolute left-[18px] top-1 w-[11px] h-[11px] rounded-full bg-brand-500 border-2 border-white dark:border-gray-900" />

                {/* Date label */}
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-lg font-bold text-gray-800 dark:text-gray-100">{d.month}/{d.day}</span>
                  <span className="text-xs text-gray-400">{d.weekday}</span>
                  <span className="text-xs text-gray-400">{day.highlights.length} 条精选</span>
                </div>

                {/* Items */}
                <ul className="space-y-2.5">
                  {day.highlights.map((item) => {
                    const cat = item.category ? CATEGORY_MAP[item.category] : null;
                    return (
                      <li key={item.id} className="card p-3">
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group block"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {cat && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-500/20 text-brand-600 dark:text-brand-500">
                                {cat.label}
                              </span>
                            )}
                            <span className="text-[11px] text-gray-400">{item.source}</span>
                            {typeof item.heat === "number" && item.heat > 0 && (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                {item.origin === "github" ? `★ ${item.heat.toLocaleString()}` : item.heat.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-brand-600 line-clamp-2 leading-snug">
                            {item.title}
                          </h3>
                          {(item.aiNote || item.summary) && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">
                              {item.aiNote || item.summary}
                            </p>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
