import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import MilestonesView from "@/components/MilestonesView";
import T from "@/components/T";
import { readArchive } from "@/lib/archive";
import { readLocalItems } from "@/lib/localStore";
import { buildMilestones } from "@/lib/milestones";
import { resolveThreshold } from "@/lib/significance";
import { abs } from "@/lib/seo";

export const metadata: Metadata = {
  title: "重大事件",
  description: "按影响力评分自动筛出的 AI 重大事件：重大发布、能力突破、融资并购与政策监管，月度时间线，自动更新。",
  alternates: { canonical: abs("/milestones") },
  openGraph: { images: ["/posters/stories-latest.png"] },
};

export default function MilestonesPage() {
  const pool = [...readLocalItems(), ...readArchive()];
  const groups = buildMilestones(pool);
  const threshold = resolveThreshold(process.env.SIGNIFICANCE_THRESHOLD);

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-brand-600"><T k="common.back" /></Link>
        </div>
        <h1 className="text-2xl font-bold dark:text-gray-100 mb-1"><T k="milestones.title" /></h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6"><T k="milestones.subtitle" /></p>
        <MilestonesView groups={groups} threshold={threshold} />
      </main>
    </>
  );
}