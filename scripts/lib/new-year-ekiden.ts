import path from "node:path";

export function buildNewYearEkidenSourceId(edition: number) {
  return `source-new-year-ekiden-${edition}-result`;
}

export function buildNewYearEkidenRaceSlug(edition: number, leg: number) {
  return `new-year-ekiden-${edition}-leg-${leg}`;
}

export function buildNewYearEkidenBatchKey(edition: number, leg: number, suffix: string) {
  return `new-year-ekiden-${edition}-leg-${leg}-${suffix}`;
}

export function buildNewYearEkidenPayloadPath(edition: number, leg: number) {
  return path.resolve(`data/imports/new-year-ekiden-${edition}-leg-${leg}.json`);
}

export function buildNewYearEkidenPdfPath(edition: number) {
  return path.resolve(`tmp/new-year-ekiden-${edition}.pdf`);
}

export function buildNewYearEkidenSourceUrl(edition: number) {
  if (edition === 69) {
    return "https://gold.jaic.org/gunma/menu/results/r_25/r250101/results.pdf";
  }

  throw new Error(`Unsupported new year ekiden edition: ${edition}`);
}

export function normalizeJa(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactJa(value: string) {
  return normalizeJa(value).replace(/ /g, "");
}

export function slugifyAscii(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

export function slugifyJapaneseFallback(prefix: string, value: string) {
  const ascii = slugifyAscii(value);
  if (ascii) {
    return `${prefix}-${ascii}`;
  }

  const hex = Buffer.from(value.normalize("NFKC")).toString("hex").slice(0, 24);
  return `${prefix}-${hex}`;
}

export function mergeNotes(existing: string | null, tokens: string[]) {
  const merged = new Set(
    (existing ?? "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean),
  );

  for (const token of tokens) {
    if (token.trim()) {
      merged.add(token.trim());
    }
  }

  const ordered = ["OP", "区間賞", "区間新", "区間タイ"].filter((token) => merged.delete(token));
  const finalTokens = [...ordered, ...merged];
  return finalTokens.length > 0 ? finalTokens.join(" / ") : null;
}

export function normalizeOrganizationLabel(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[ 　]/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/[／/]/g, "・")
    .replace(/附属/g, "付属")
    .replace(/大學/g, "大学")
    .trim();
}
