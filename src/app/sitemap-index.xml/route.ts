import { buildAbsoluteUrl } from "@/lib/site";
import { sitemapIds } from "../sitemap";

export const dynamic = "force-dynamic";

export function GET() {
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapIds.map((id) => `  <sitemap><loc>${buildAbsoluteUrl(`/sitemap/${id}.xml`).toString()}</loc></sitemap>`),
    "</sitemapindex>",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
