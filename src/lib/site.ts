import type { Metadata } from "next";
import { locales, type Locale } from "@/lib/i18n";

const defaultSiteUrl = "https://tasukikeifu.com";
const openGraphLocaleMap: Record<Locale, string> = {
  ja: "ja_JP",
  zh: "zh_CN",
  "zh-Hant": "zh_TW",
  en: "en_US",
  ko: "ko_KR",
};

export const siteConfig = {
  name: "襷の系譜",
  searchName: "襷の系譜",
  alternateSiteNames: ["Tasuki Keifu", "駅伝データベース 襷の系譜"],
  description: "高校・大学・実業団をつなぐ駅伝データベース",
  keywords: [
    "駅伝",
    "駅伝データベース",
    "大学駅伝",
    "箱根駅伝",
    "全日本大学駅伝",
    "出雲駅伝",
    "駅伝選手",
    "陸上長距離",
  ],
  authors: [{ name: "襷の系譜" }],
  defaultLocale: "ja" as Locale,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? defaultSiteUrl,
};

export function buildAbsoluteUrl(path = "") {
  return new URL(path || "/", siteConfig.siteUrl);
}

export function buildLocalizedPath(locale: Locale, path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `/${locale}${normalizedPath === "/" ? "" : normalizedPath}`;
}

export function buildLocalizedUrl(locale: Locale, path = "") {
  return buildAbsoluteUrl(buildLocalizedPath(locale, path)).toString();
}

function getCanonicalLocale(locale: Locale) {
  return locale === siteConfig.defaultLocale ? locale : siteConfig.defaultLocale;
}

function getIndexableLocales() {
  return [siteConfig.defaultLocale];
}

export function buildLocaleAlternates(path = "", locale: Locale = siteConfig.defaultLocale) {
  const alternateLocales = locale === siteConfig.defaultLocale ? getIndexableLocales() : [siteConfig.defaultLocale];

  return Object.fromEntries(
    alternateLocales.map((alternateLocale) => [alternateLocale, buildLocalizedUrl(alternateLocale, path)]),
  );
}

type BuildMetadataInput = {
  title: string;
  description: string;
  path: string;
  locale: Locale;
  keywords?: string[];
  type?: "website" | "article";
};

export function buildPageMetadata({
  title,
  description,
  path,
  locale,
  keywords = [],
  type = "website",
}: BuildMetadataInput): Metadata {
  const canonicalLocale = getCanonicalLocale(locale);

  return {
    title,
    description,
    keywords: [...siteConfig.keywords, ...keywords],
    authors: siteConfig.authors,
    creator: siteConfig.name,
    publisher: siteConfig.name,
    category: "Sports",
    alternates: {
      canonical: buildLocalizedPath(canonicalLocale, path),
      languages: buildLocaleAlternates(path, locale),
    },
    openGraph: {
      type,
      locale: openGraphLocaleMap[locale],
      siteName: siteConfig.searchName,
      title,
      description,
      url: buildLocalizedPath(locale, path),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export function buildWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.searchName,
    alternateName: siteConfig.alternateSiteNames,
    url: buildAbsoluteUrl("/").toString(),
    potentialAction: {
      "@type": "SearchAction",
      target: `${buildLocalizedUrl(siteConfig.defaultLocale, "/players")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.searchName,
    alternateName: siteConfig.alternateSiteNames,
    url: buildAbsoluteUrl("/").toString(),
  };
}
