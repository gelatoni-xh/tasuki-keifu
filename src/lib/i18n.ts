import ja from "../../messages/ja.json";
import zh from "../../messages/zh.json";
import zhHant from "../../messages/zh-Hant.json";
import en from "../../messages/en.json";
import ko from "../../messages/ko.json";

export const locales = ["ja", "zh", "zh-Hant", "en", "ko"] as const;

export type Locale = (typeof locales)[number];

const dictionaries = {
  ja,
  zh,
  "zh-Hant": zhHant,
  en,
  ko,
};

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function getDictionary(locale: Locale = "ja") {
  return dictionaries[locale];
}

export function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
