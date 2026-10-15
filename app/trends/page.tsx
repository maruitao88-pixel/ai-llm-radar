import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import TrendsCharts from "@/components/TrendsCharts";
import { readArchive } from "@/lib/archive";
import { readLocalItems } from "@/lib/localStore";
import { buildDailyCounts, buildTopicTrends } from "@/lib/trends";
import { abs } from "@/lib/seo";

export const metadata: Metadata = {
  title: "趋势洞察",
  description: "AI 行业资讯趋势可视化：每日新增量、分类分布、热门话题变化一目了然。",
  alternates: { canonical: abs("/trends") },
};

export default function TrendsPage() {
  const arch = readArchive();
  const items = arch.length > 0 ? arch : readLocalItems();
  const daily = buildDailyCounts(items);
  const topics = buildTopicTrends(items, 8);

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-brand-600">← 返回首页</Link>
        </div>
        <h1 className="text-2xl font-bold dark:text-gray-100 mb-1">趋势洞察</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          基于 {items.length} 条历史数据，覆盖 {daily.length} 天
        </p>
        <TrendsCharts daily={daily} topics={topics} />
      </main>
    </>
  );
}
