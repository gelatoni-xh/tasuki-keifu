import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/site";

export function getDirectoryPage(value?: string) {
  const page = Number(value ?? "1");
  return /^\d+$/.test(value ?? "1") && Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function buildDirectoryMetadata({
  title, description, path, locale, keywords, page, hasFilters,
}: {
  title: string;
  description: string;
  path: string;
  locale: Locale;
  keywords: string[];
  page?: string;
  hasFilters: boolean;
}): Metadata {
  const pageNumber = getDirectoryPage(page);
  const isInvalidPage = page !== undefined && page !== String(pageNumber);
  const isPaginated = !hasFilters && !isInvalidPage && pageNumber > 1;
  const metadata = buildPageMetadata({
    title: isPaginated ? `${title}（${pageNumber}ページ目）` : title,
    description,
    path: isPaginated ? `${path}?page=${pageNumber}` : path,
    locale,
    keywords,
  });

  if (hasFilters || isInvalidPage) {
    metadata.robots = {
      index: false, follow: true,
      googleBot: { index: false, follow: true },
    };
  }
  return metadata;
}
