import path from "node:path";

export const NATIONAL_PREFECTURAL_EKIDEN_MEN_COMPETITION_SLUG = "national-prefectural-ekiden-men";
export const NATIONAL_PREFECTURAL_EKIDEN_MEN_COMPETITION_NAME_JA = "全国都道府県対抗男子駅伝競走大会";
export const NATIONAL_PREFECTURAL_EKIDEN_MEN_WEBSITE_URL = "https://www.hiroshima-ekiden.com/";

const EDITION_SOURCE_URLS = new Map<number, { entryUrl: string; resultUrl: string }>([
  [
    29,
    {
      entryUrl: "https://www.jaaf.or.jp/files/competition/document/1798-4.pdf",
      resultUrl: "https://www.hiroshima-ekiden.com/information/pdf/record29.pdf",
    },
  ],
  [
    30,
    {
      entryUrl: "https://www.hiroshima-ekiden.com/information/pdf/entrydata_30.pdf",
      resultUrl: "https://www.hiroshima-ekiden.com/information/pdf/record30.pdf",
    },
  ],
  [
    31,
    {
      entryUrl: "https://www.hiroshima-ekiden.com/information/pdf/31_07_1entrydata.pdf",
      resultUrl: "https://www.hiroshima-ekiden.com/information/pdf/record31.pdf",
    },
  ],
]);

const PREFECTURE_ROWS = [
  ["北海道", "北海道", "hokkaido"],
  ["青森", "青森県", "aomori"],
  ["岩手", "岩手県", "iwate"],
  ["宮城", "宮城県", "miyagi"],
  ["秋田", "秋田県", "akita"],
  ["山形", "山形県", "yamagata"],
  ["福島", "福島県", "fukushima"],
  ["茨城", "茨城県", "ibaraki"],
  ["栃木", "栃木県", "tochigi"],
  ["群馬", "群馬県", "gunma"],
  ["埼玉", "埼玉県", "saitama"],
  ["千葉", "千葉県", "chiba"],
  ["東京", "東京都", "tokyo"],
  ["神奈川", "神奈川県", "kanagawa"],
  ["新潟", "新潟県", "niigata"],
  ["富山", "富山県", "toyama"],
  ["石川", "石川県", "ishikawa"],
  ["福井", "福井県", "fukui"],
  ["山梨", "山梨県", "yamanashi"],
  ["長野", "長野県", "nagano"],
  ["岐阜", "岐阜県", "gifu"],
  ["静岡", "静岡県", "shizuoka"],
  ["愛知", "愛知県", "aichi"],
  ["三重", "三重県", "mie"],
  ["滋賀", "滋賀県", "shiga"],
  ["京都", "京都府", "kyoto"],
  ["大阪", "大阪府", "osaka"],
  ["兵庫", "兵庫県", "hyogo"],
  ["奈良", "奈良県", "nara"],
  ["和歌山", "和歌山県", "wakayama"],
  ["鳥取", "鳥取県", "tottori"],
  ["島根", "島根県", "shimane"],
  ["岡山", "岡山県", "okayama"],
  ["広島", "広島県", "hiroshima"],
  ["山口", "山口県", "yamaguchi"],
  ["徳島", "徳島県", "tokushima"],
  ["香川", "香川県", "kagawa"],
  ["愛媛", "愛媛県", "ehime"],
  ["高知", "高知県", "kochi"],
  ["福岡", "福岡県", "fukuoka"],
  ["佐賀", "佐賀県", "saga"],
  ["長崎", "長崎県", "nagasaki"],
  ["熊本", "熊本県", "kumamoto"],
  ["大分", "大分県", "oita"],
  ["宮崎", "宮崎県", "miyazaki"],
  ["鹿児島", "鹿児島県", "kagoshima"],
  ["沖縄", "沖縄県", "okinawa"],
] as const;

export const NATIONAL_PREFECTURAL_EKIDEN_MEN_PREFECTURES = PREFECTURE_ROWS.map(([short, full, slug]) => ({
  short,
  full,
  slug,
}));

const PREFECTURE_BY_SHORT = new Map(
  NATIONAL_PREFECTURAL_EKIDEN_MEN_PREFECTURES.map((row) => [row.short, row]),
);

const PREFECTURE_BY_FULL = new Map(
  NATIONAL_PREFECTURAL_EKIDEN_MEN_PREFECTURES.map((row) => [row.full, row]),
);

export function buildNationalPrefecturalEkidenMenEditionSlug(edition: number) {
  return `${NATIONAL_PREFECTURAL_EKIDEN_MEN_COMPETITION_SLUG}-${edition}`;
}

export function buildNationalPrefecturalEkidenMenRaceSlug(edition: number, leg: number) {
  return `${buildNationalPrefecturalEkidenMenEditionSlug(edition)}-leg-${leg}`;
}

export function buildNationalPrefecturalEkidenMenBatchKey(edition: number, leg: number) {
  return `${buildNationalPrefecturalEkidenMenRaceSlug(edition, leg)}-import`;
}

export function buildNationalPrefecturalEkidenMenPayloadPath(edition: number, leg: number) {
  return path.resolve(`data/imports/national-prefectural-ekiden-men-${edition}-leg-${leg}.json`);
}

export function buildNationalPrefecturalEkidenMenSummaryPath(edition: number) {
  return path.resolve(`data/imports/national-prefectural-ekiden-men-${edition}-summary.json`);
}

export function buildNationalPrefecturalEkidenMenSourceId(edition: number) {
  return `source-national-prefectural-ekiden-men-${edition}-combined`;
}

export function buildNationalPrefecturalEkidenMenEntrySourceId(edition: number) {
  return `source-national-prefectural-ekiden-men-${edition}-entry`;
}

export function buildNationalPrefecturalEkidenMenEntryPdfPath(edition: number) {
  return path.resolve(`tmp/todofuken/men${edition}-entry.pdf`);
}

export function buildNationalPrefecturalEkidenMenResultPdfPath(edition: number) {
  return path.resolve(`tmp/todofuken/men${edition}-record.pdf`);
}

export function getNationalPrefecturalEkidenMenSourceUrls(edition: number) {
  const urls = EDITION_SOURCE_URLS.get(edition);
  if (!urls) {
    throw new Error(`Unsupported men prefectural ekiden edition: ${edition}`);
  }
  return urls;
}

export function normalizeWhitespace(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactJa(value: string) {
  return normalizeWhitespace(value).replace(/ /g, "");
}

export function buildPrefectureRepresentativeSlug(prefecture: string) {
  const entry = PREFECTURE_BY_FULL.get(prefecture);
  if (!entry) {
    throw new Error(`Unsupported prefecture: ${prefecture}`);
  }

  return `${entry.slug}-prefecture-representative`;
}

export function normalizePrefectureLabel(value: string) {
  const compact = compactJa(value);

  const byShort = PREFECTURE_BY_SHORT.get(compact);
  if (byShort) {
    return byShort.full;
  }

  const byFull = PREFECTURE_BY_FULL.get(compact);
  if (byFull) {
    return byFull.full;
  }

  return null;
}

export function getPrefectureShortLabel(prefecture: string) {
  const entry = PREFECTURE_BY_FULL.get(prefecture);
  return entry?.short ?? null;
}
