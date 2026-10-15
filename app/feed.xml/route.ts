import { readLocalItems } from "@/lib/localStore";
import { normalizeItems } from "@/lib/classify";
import { filterItems } from "@/lib/filter";
import { cleanText } from "@/lib/text";
import { SITE_DESC, SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function GET() {
  const items = filterItems(normalizeItems(readLocalItems()), { mode: "all", sort: "latest" }).slice(0, 30);
  const now = new Date().toUTCString();

  const entries = items
    .map((it) => {
      const desc = it.aiNote || cleanText(it.summary) || it.title;
      const date = it.publishedAt ? new Date(it.publishedAt).toUTCString() : now;
      return `    <item>
      <title>${esc(it.title)}</title>
      <link>${esc(it.sourceUrl)}</link>
      <guid isPermaLink="false">${esc(it.id)}</guid>
      <source url="${SITE_URL}/">${esc(it.source)}</source>
      <pubDate>${date}</pubDate>
      <description>${esc(desc)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${SITE_URL}/</link>
    <description>${esc(SITE_DESC)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${now}</lastBuildDate>
${entries}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
