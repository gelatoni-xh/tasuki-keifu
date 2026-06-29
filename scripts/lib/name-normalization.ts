export function normalizeDisplayNameJa(value: string) {
  return value.replace(/　/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeJaForLookup(value: string) {
  return normalizeDisplayNameJa(value).replace(/ /g, "");
}
