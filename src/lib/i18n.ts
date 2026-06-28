import ja from "../../messages/ja.json";
import zh from "../../messages/zh.json";
import en from "../../messages/en.json";

export const locales = ["ja", "zh", "en"] as const;

export type Locale = (typeof locales)[number];

const dictionaries = {
  ja,
  zh,
  en,
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
