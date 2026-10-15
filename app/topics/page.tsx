import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import { readArchive } from "@/lib/archive";
import { readLocalItems } from "@/lib/localStore";
import { ENTITIES, ENTITY_MAP, entityCounts } from "@/lib/entities";
import { abs } from "@/lib/seo";

export const metadata: Metadata = {
  title: "话题总览",
  description: "AI Search 追踪的全部话题：按热度排名，点击进入话题详情页查看历史资讯。",
  alternates: { canonical: abs("/topics") },
};

export default function TopicsPage() {
  const archive = readArchive();
  const items = archive.length > 0 ? archive : readLocalItems();
  const counts = entityCounts(items);
  const all = ENTITIES
    .map((e) => ({ ...e, count: counts[e.slug] ?? 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  const hasPage = (slug: string) => (counts[slug] ?? 0) >= 5;

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-brand-600">← 返回首页</Link>
        </div>
        <h1 className="text-2xl font-bold dark:text-gray-100 mb-1">话题总览</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          共追踪 {all.length} 个话题，基于 {items.length} 条历史资讯
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {all.map((e) => {
            const inner = (
              <div className="card p-4 flex flex-col items-center text-center">
                <span className="text-2xl font-bold text-brand-600 dark:text-brand-500">{e.count}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-1">{e.name}</span>
                <span className="text-[11px] text-gray-400 mt-0.5">相关资讯</span>
              </div>
            );
            return hasPage(e.slug) ? (
              <Link key={e.slug} href={`/topic/${e.slug}`} className="hover:scale-[1.02] transition-transform">
                {inner}
              </Link>
            ) : (
              <div key={e.slug} className="opacity-60">{inner}</div>
            );
          })}
        </div>
      </main>
    </>
  );
}
