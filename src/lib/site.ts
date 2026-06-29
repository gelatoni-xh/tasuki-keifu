import { locales, type Locale } from "@/lib/i18n";

const defaultSiteUrl = "https://tasukikeifu.com";

export const siteConfig = {
  name: "襷の系譜",
  searchName: "駅伝データベース 襷の系譜",
  description: "高校・大学・実業団をつなぐ駅伝データベース",
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

export function buildLocaleAlternates(path = "") {
  return Object.fromEntries(
    locales.map((locale) => [locale, buildLocalizedUrl(locale, path)]),
  );
}
