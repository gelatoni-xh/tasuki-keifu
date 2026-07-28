import { buildAbsoluteUrl } from "@/lib/site";
import { getSitemapLastModified, sitemapIds } from "../sitemap";

export const dynamic = "force-dynamic";

export async function GET() {
  const sitemapEntries = await Promise.all(
    sitemapIds.map(async (id) => ({
      id,
      loc: buildAbsoluteUrl(`/sitemap/${id}.xml`).toString(),
      lastmod: (await getSitemapLastModified(id)).toISOString(),
    })),
  );

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapEntries.map(
      (entry) => `  <sitemap><loc>${entry.loc}</loc><lastmod>${entry.lastmod}</lastmod></sitemap>`,
    ),
    "</sitemapindex>",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
