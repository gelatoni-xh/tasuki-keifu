import path from "node:path";

export function buildAllJapanUniversityEkidenSourceId(edition: number) {
  return `source-all-japan-university-ekiden-${edition}`;
}

export function buildAllJapanUniversityEkidenRaceSlug(edition: number, leg: number) {
  return `all-japan-university-ekiden-${edition}-leg-${leg}`;
}

export function buildAllJapanUniversityEkidenBatchKey(edition: number, leg: number, suffix: string) {
  return `all-japan-university-ekiden-${edition}-leg-${leg}-${suffix}`;
}

export function buildAllJapanUniversityEkidenPayloadPath(edition: number, leg: number) {
  return path.resolve(`data/imports/all-japan-university-ekiden-${edition}-leg-${leg}.json`);
}

export function buildAllJapanUniversityEkidenPdfPath(edition: number) {
  return path.resolve(`tmp/all-japan-university-ekiden-${edition}.pdf`);
}

export function buildAllJapanUniversityEkidenSourceUrl(edition: number) {
  if (edition === 52) {
    return "https://daigaku-ekiden.com/datafile/files/2020result.pdf";
  }

  if (edition === 53) {
    return "https://daigaku-ekiden.com/datafile/files/2021result.pdf";
  }

  if (edition === 54) {
    return "https://daigaku-ekiden.com/datafile/files/2022result.pdf";
  }

  if (edition === 55) {
    return "https://daigaku-ekiden.com/result/result.pdf";
  }

  if (edition === 56) {
    return "https://daigaku-ekiden.com/datafile/files/2024result.pdf";
  }

  if (edition === 57) {
    return "https://daigaku-ekiden.com/files/2025_result.pdf";
  }

  throw new Error(`Unsupported all-japan university ekiden edition: ${edition}`);
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
  if (/[^\x00-\x7F]/.test(value)) {
    const hex = Buffer.from(value.normalize("NFKC")).toString("hex").slice(0, 120);
    return `${prefix}-${hex}`;
  }

  const ascii = slugifyAscii(value);
  if (ascii) {
    return `${prefix}-${ascii}`;
  }

  const hex = Buffer.from(value.normalize("NFKC")).toString("hex").slice(0, 80);
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
