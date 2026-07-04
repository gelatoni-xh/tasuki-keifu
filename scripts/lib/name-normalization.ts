export function normalizeDisplayNameJa(value: string) {
  return value.replace(/　/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizePersonDisplayNameJa(value: string) {
  const normalized = normalizeDisplayNameJa(value);

  return /[\p{Script=Han}々]/u.test(normalized) ? normalized.replace(/ /g, "") : normalized;
}

export function normalizeJaForLookup(value: string) {
  return normalizeDisplayNameJa(value).replace(/ /g, "");
}
