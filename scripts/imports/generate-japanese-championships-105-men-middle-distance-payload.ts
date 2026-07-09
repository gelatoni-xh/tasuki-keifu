import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { OrganizationType, PrismaClient } from "@prisma/client";

import { raceImportPayloadSchema, type RaceImportPayload } from "../lib/import-types";
import { loadWorkspaceEnv } from "../lib/load-env";
import { normalizeDisplayNameJa, normalizeJaForLookup } from "../lib/name-normalization";
import { normalizeOrganizationLabel } from "../lib/organization-normalization";

loadWorkspaceEnv();

const execFileAsync = promisify(execFile);

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

const SOURCE_ID = "source-jch-105-result";
const SOURCE_URL = "https://www.jaaf.or.jp/files/upload/202106/27_192418.pdf";
const BATCH_DATE = "20260710";
const SOURCE_DIR = path.resolve("data/imports/japanese-championships-5000m-105-source");
const PDF_PATH = path.join(SOURCE_DIR, "resultall.pdf");
const TEXT_PATH = path.join(SOURCE_DIR, "resultall.txt");
const OUT_DIR = path.resolve("data/imports");
const COLUMN_SPLIT = 79;
const LOCAL_CACHE_PDF_PATH = path.resolve("data/imports/jch-2021-resultall.pdf");

type OrgType = RaceImportPayload["entries"][number]["raceOrganizationType"];
type SectionKey =
  | "800-heat-1"
  | "800-heat-2"
  | "800-heat-3"
  | "800-final"
  | "1500-heat-1"
  | "1500-heat-2"
  | "1500-final"
  | "3000sc-final";

type SectionDefinition = {
  key: SectionKey;
  raceSlug: string;
  sourceEntityPrefix: string;
  title: string;
  discipline: "m800" | "m1500" | "m3000sc";
};

type ParsedRow = {
  bib: string;
  name: string;
  organizationLabel: string;
  mark: string;
  rank: number | null;
  notes: string | null;
};

type LookupOrganizationRow = {
  slug: string;
  nameJa: string;
  type: OrganizationType;
};

type ResolvedOrganization = {
  slug: string;
  nameJa: string;
  type: OrgType;
};

const SECTION_DEFINITIONS: SectionDefinition[] = [
  { key: "800-heat-1", raceSlug: "japanese-championships-5000m-105-men-800-heat-1", sourceEntityPrefix: "jch105-men-800-heat1", title: "男子800m 予選1組", discipline: "m800" },
  { key: "800-heat-2", raceSlug: "japanese-championships-5000m-105-men-800-heat-2", sourceEntityPrefix: "jch105-men-800-heat2", title: "男子800m 予選2組", discipline: "m800" },
  { key: "800-heat-3", raceSlug: "japanese-championships-5000m-105-men-800-heat-3", sourceEntityPrefix: "jch105-men-800-heat3", title: "男子800m 予選3組", discipline: "m800" },
  { key: "800-final", raceSlug: "japanese-championships-5000m-105-men-800-final", sourceEntityPrefix: "jch105-men-800-final", title: "男子800m 決勝", discipline: "m800" },
  { key: "1500-heat-1", raceSlug: "japanese-championships-5000m-105-men-1500-heat-1", sourceEntityPrefix: "jch105-men-1500-heat1", title: "男子1500m 予選1組", discipline: "m1500" },
  { key: "1500-heat-2", raceSlug: "japanese-championships-5000m-105-men-1500-heat-2", sourceEntityPrefix: "jch105-men-1500-heat2", title: "男子1500m 予選2組", discipline: "m1500" },
  { key: "1500-final", raceSlug: "japanese-championships-5000m-105-men-1500-final", sourceEntityPrefix: "jch105-men-1500-final", title: "男子1500m 決勝", discipline: "m1500" },
  { key: "3000sc-final", raceSlug: "japanese-championships-5000m-105-men-3000sc-final", sourceEntityPrefix: "jch105-men-3000sc-final", title: "男子3000mSC 決勝", discipline: "m3000sc" },
];

const ORGANIZATION_LABEL_OVERRIDES = new Map<string, string>([
  ["スズキ", "スズキ"],
  ["中央大", "中央大学"],
  ["阿見AC", "阿見AC"],
  ["広島経済大", "広島経済大学"],
  ["環太平洋大", "環太平洋大学"],
  ["関西学院大", "関西学院大学"],
  ["東海大", "東海大学"],
  ["サンベルクス", "サンベルクス"],
  ["法政大", "法政大学"],
  ["ＴＡＫＥＯＡＣ", "TAKEOAC"],
  ["立教大", "立教大学"],
  ["北海道大", "北海道大学"],
  ["小森ｺｰﾎﾟ", "小森コーポ"],
  ["ﾄｰｴﾈｯｸ", "トーエネック"],
  ["Honda", "Honda"],
  ["洛南高", "洛南高校"],
  ["カネボウ", "カネボウ"],
  ["明治大", "明治大学"],
  ["大阪ガス", "大阪ガス"],
  ["横浜国立大", "横浜国立大学"],
  ["早稲田大", "早稲田大学"],
  ["SGﾎｰﾙﾃﾞｨﾝｸﾞｽ", "SGホールディングス"],
  ["レデイ薬局", "レデイ薬局"],
  ["大塚製薬", "大塚製薬"],
  ["愛三工業", "愛三工業"],
  ["青山学院大", "青山学院大学"],
  ["プレス工業", "プレス工業"],
  ["富士通", "富士通"],
  ["山陽特殊製鋼", "山陽特殊製鋼"],
  ["アースグロー", "アースグロー"],
  ["新潟ｱﾙﾋﾞﾚｯｸｽRC", "新潟アルビレックスRC"],
]);

const PERSON_SLUG_OVERRIDES = new Map<string, string>([
  ["川元 奨", "person-kanaguri2025-e5b79de58583e5a5a8"],
  ["金子 魅玖人", "person-kanaguri2026-e98791e5ad90e9ad85e78e96e4ba"],
  ["瀬戸口 大地", "person-hokuren2021fukagawa-e780ace688b8e58fa3e5a4a7e59cb0"],
  ["一ノ宮 健郎", "person-hokuren2021kitami-e4b880e3838ee5aeaee581a5e9838e"],
  ["山﨑 優希", "person-e5b1b1efa89120e584aae5b8"],
  ["中井 啓太", "person-hokuren2026chitose-e4b8ade4ba95e59593e5a4aa"],
  ["田母神 一喜", "person-hokuren2026chitose-e794b0e6af8de7a59ee4b880e5969c"],
  ["源 裕貴", "minamoto-hiroki"],
  ["飯濵 友太郎", "person-hokuren2026abashiri-e9a3afe6bfb520e58f8be5a4aae9838e"],
  ["高橋 佑輔", "person-e9ab98e6a98b20e4bd91e8bc"],
  ["薄田 健太郎", "person-e89684e794b020e581a5e5a4aae9838e"],
  ["館澤 亨次", "person-kanaguri2026-e9a4a8e6bea4e4baa8e6ac1"],
  ["安倍 優紀", "person-hokuren2026abashiri-e5ae89e5808de584aae7b480"],
  ["梅谷 健太", "person-hokuren2021kitami-e6a285e8b0b7e581a5e5a4aa"],
  ["松本 純弥", "person-kanaguri2026-e69dbee69cace7b494e5bca5"],
  ["クレイ アーロン竜波", "clay-allon-tatsunami"],
  ["溝口 仁", "person-hokuren2026chitose-e6ba9de58fa320e4bb81"],
  ["舟津 彰馬", "person-hokuren2026chitose-e8889fe6b4a5e5bdb0e9a6ac"],
  ["森田 佳祐", "person-hokuren2026chitose-e6a3aee794b0e4bdb3e7a590"],
  ["飯島 陸斗", "person-kanaguri2026-e9a3afe5b3b620e999b8e69697"],
  ["飯澤 千翔", "person-kanaguri2026-e9a3afe6bea4e58d83e7bf94"],
  ["荒井 七海", "arai-nanami"],
  ["河村 一輝", "person-hokuren2026chitose-e6b2b3e69d91e4b880e8bc9d"],
  ["佐藤 圭汰", "person-e4bd90e897a420e59cbde6b19f"],
  ["服部 凱杏", "person-jusic2021-e69c8de983a8e587b1e69d8f"],
  ["ミラー千本 真章", "person-kanaguri2022-e3839fe383a9e383bce58d83e69cace79c9fe7ab"],
  ["ﾐﾗｰ千本 真章", "person-kanaguri2022-e3839fe383a9e383bce58d83e69cace79c9fe7ab"],
  ["石井 優樹", "person-jusic2021-e79fb3e4ba95e584aae6a8b9"],
  ["三浦 龍司", "miura-ryuji"],
  ["山口 浩勢", "person-hokuren2026abashiri-e5b1b1e58fa3e6b5a9e58ba2"],
  ["青木 涼真", "person-honda-aoki-ryoma"],
  ["潰滝 大記", "person-hokuren2026abashiri-e6bda4e6bb9d20e5a4a7e8a898"],
  ["小原 響", "person-obanazawa-2024-obi-01"],
  ["楠 康成", "person-hokuren2026abashiri-e6a5a020e5bab7e68890"],
  ["荻野 太成", "person-hokuren2026abashiri-e88dbbe9878e20e5a4aae68890"],
  ["菖蒲 敦司", "person-e88f96e892b220e695a6e58fb8"],
  ["内田 賢利", "person-hokuren2026abashiri-e58685e794b0e8b3a2e588a9"],
]);

const ORGANIZATION_ENTITY_OVERRIDES = new Map<string, { slug: string; nameJa: string; type: OrgType }>([
  ["阿見AC", { slug: "ami-athlete-club", nameJa: "阿見アスリートクラブ", type: "club" }],
  ["TAKEOAC", { slug: "takeo-ac", nameJa: "TAKEOAC", type: "club" }],
  ["スズキ", { slug: "suzuki", nameJa: "スズキ", type: "corporate_team" }],
  ["DeNA", { slug: "org-kanaguri2023-44654e41", nameJa: "DeNAアスレティックスエリート", type: "club" }],
  ["小森ｺｰﾎﾟ", { slug: "komori-corporation", nameJa: "小森コーポ", type: "corporate_team" }],
  ["レデイ薬局", { slug: "lady-pharmacy", nameJa: "レデイ薬局", type: "corporate_team" }],
  ["Texas A&M", { slug: "texas-am-university", nameJa: "Texas A&M", type: "university" }],
  ["福井県スポ協", { slug: "fukui-pref-sports-association", nameJa: "福井県スポ協", type: "club" }],
  ["三重県スポ協", { slug: "mie-pref-sports-association", nameJa: "三重県スポ協", type: "club" }],
  ["東海大翔洋高", { slug: "tokai-dai-shoyo-high-school", nameJa: "東海大学付属静岡翔洋高等学校", type: "high_school" }],
  ["新潟ｱﾙﾋﾞﾚｯｸｽRC", { slug: "niigata-albirex-running-club", nameJa: "新潟アルビレックスRC", type: "club" }],
  ["新潟アルビレックスRC", { slug: "niigata-albirex-running-club", nameJa: "新潟アルビレックスRC", type: "club" }],
]);

function compactForSlug(value: string) {
  return value.normalize("NFKC").replace(/[ 　]/g, "").trim();
}

function fallbackSlug(prefix: string, value: string) {
  const compacted = compactForSlug(value);
  const ascii = compacted.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ascii && (ascii.length >= 6 || ascii === compacted.toLowerCase())) return `${prefix}-${ascii}`;
  return `${prefix}-${createHash("sha1").update(compacted).digest("hex").slice(0, 20)}`;
}

function normalizeRomanLookup(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[._-]/g, " ").replace(/\s+/g, " ").trim();
}

function mapOrganizationType(type: OrganizationType): OrgType {
  switch (type) {
    case OrganizationType.university:
      return "university";
    case OrganizationType.high_school:
      return "high_school";
    case OrganizationType.junior_high_school:
      return "junior_high_school";
    case OrganizationType.club:
      return "club";
    case OrganizationType.company:
      return "company";
    case OrganizationType.prefecture_representative:
      return "prefecture_representative";
    case OrganizationType.student_union_select:
      return "student_union_select";
    default:
      return "corporate_team";
  }
}

function inferOrganizationType(label: string): OrgType {
  const normalized = normalizeOrganizationLabel(label);
  if (/大学|^.+大$/.test(normalized)) return "university";
  if (/高校|^.+高$/.test(normalized)) return "high_school";
  if (/(AC|RC|FC|TC|クラブ|陸協|協会|Team)$/i.test(normalized)) return "club";
  return "corporate_team";
}

async function ensureSourceFiles() {
  await mkdir(SOURCE_DIR, { recursive: true });
  try {
    await access(PDF_PATH, constants.F_OK);
  } catch {
    try {
      await access(LOCAL_CACHE_PDF_PATH, constants.F_OK);
      await copyFile(LOCAL_CACHE_PDF_PATH, PDF_PATH);
    } catch {
      const response = await fetch(SOURCE_URL);
      if (!response.ok) throw new Error(`Failed to fetch source PDF: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(PDF_PATH, bytes);
    }
  }
  try {
    await access(TEXT_PATH, constants.F_OK);
  } catch {
    await execFileAsync("pdftotext", ["-layout", PDF_PATH, TEXT_PATH]);
  }
}

async function loadOrganizationLookup() {
  const rows = await prisma.organization.findMany({
    select: { slug: true, nameJa: true, type: true, shortName: true, nameVariants: { select: { value: true } } },
  });
  const keyMap = new Map<string, LookupOrganizationRow | null>();
  for (const row of rows) {
    const keys = new Set<string>([
      normalizeOrganizationLabel(row.nameJa),
      ...(row.shortName ? [normalizeOrganizationLabel(row.shortName)] : []),
      ...row.nameVariants.map((variant) => normalizeOrganizationLabel(variant.value)),
    ]);
    for (const key of keys) {
      const current = keyMap.get(key);
      const mapped = { slug: row.slug, nameJa: row.nameJa, type: row.type };
      if (!current) {
        keyMap.set(key, mapped);
        continue;
      }
      if (current.slug !== mapped.slug) keyMap.set(key, null);
    }
  }
  return keyMap;
}

async function loadPersonLookups() {
  const rows = await prisma.person.findMany({
    select: { slug: true, displayNameJaSearch: true, displayNameRoman: true },
  });
  const jaMap = new Map<string, string | null>();
  const romanMap = new Map<string, string | null>();
  for (const row of rows) {
    const currentJa = jaMap.get(row.displayNameJaSearch);
    if (!currentJa) jaMap.set(row.displayNameJaSearch, row.slug);
    else if (currentJa !== row.slug) jaMap.set(row.displayNameJaSearch, null);
    if (row.displayNameRoman) {
      const key = normalizeRomanLookup(row.displayNameRoman);
      const currentRoman = romanMap.get(key);
      if (!currentRoman) romanMap.set(key, row.slug);
      else if (currentRoman !== row.slug) romanMap.set(key, null);
    }
  }
  return { jaMap, romanMap };
}

function splitPages(text: string) {
  return text.split("\f").map((page) => page.trim()).filter(Boolean);
}

function normalizeNotes(remark: string | undefined, qualifier: string | undefined, op: boolean) {
  const tokens = [
    ...(op ? ["OP"] : []),
    ...(remark ? remark.split(",") : []),
    ...(qualifier ? qualifier.split(",") : []),
  ]
    .map((token) => token.trim())
    .filter(Boolean);

  if (!tokens.length) return null;
  return Array.from(new Set(tokens)).join(",");
}

function parseSingleColumnLine(line: string) {
  const sanitized = line.replace(/\s{2,}(?:Lap|ORD|Round1|Final|Result)\b.*$/, "");
  const compacted = normalizeDisplayNameJa(sanitized);
  const matched = compacted.match(
    /^(?:(OP|\d+)\s+)?(\d+)\s+([A-Z0-9]+)\s+(.+?\(\d+\))\s+(.+?)\s+(DNS|DNF|DQ(?:,[A-Za-z0-9]+)?|\d{1,2}:\d{2}\.\d{2})(?:\s+([A-Za-z0-9,]+))?(?:\s+([A-Za-z0-9]+))?$/,
  );
  if (!matched) throw new Error(`Unexpected result row: ${line}`);

  const [, place, , bib, rawName, rawOrganization, rawMark, remark, qualifier] = matched;
  const name = normalizeDisplayNameJa(rawName.replace(/\(\d+\)$/, "").trim());
  const organizationLabel = normalizeDisplayNameJa(rawOrganization);
  const isOp = place === "OP";
  const [mark, inlineRemark] = rawMark.split(",", 2);
  const notes =
    mark === "DNS" || mark === "DNF" || mark === "DQ"
      ? inlineRemark || remark || qualifier
        ? `${mark},${[inlineRemark, remark, qualifier].filter(Boolean).join(",")}`
        : mark
      : normalizeNotes(remark, qualifier, isOp);

  return {
    bib,
    name,
    organizationLabel,
    mark,
    rank: !place || isOp || mark === "DNS" || mark === "DNF" || mark === "DQ" ? null : Number(place),
    notes,
  } satisfies ParsedRow;
}

function extractRowLines(block: string) {
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/\f/g, "").trimEnd())
    .filter((line) => /^\s*(?:OP|\d+)?\s*\d+\s+[A-Z0-9]+\s+\S/.test(line));
}

function parseDualColumnBlock(block: string) {
  const leftRows: ParsedRow[] = [];
  const rightRows: ParsedRow[] = [];
  for (const line of block.split(/\r?\n/)) {
    const raw = line.replace(/\f/g, "");
    if (!raw.trim()) continue;
    const left = raw.slice(0, COLUMN_SPLIT).trimEnd();
    const right = raw.slice(COLUMN_SPLIT).trimEnd();
    if (/^\s*(?:OP|\d+)?\s*\d+\s+[A-Z0-9]+\s+\S/.test(left)) leftRows.push(parseSingleColumnLine(left));
    if (/^\s*(?:OP|\d+)?\s*\d+\s+[A-Z0-9]+\s+\S/.test(right)) rightRows.push(parseSingleColumnLine(right));
  }
  return { leftRows, rightRows };
}

function getPage(text: string, title: string) {
  const pages = splitPages(text).filter((page) => page.includes(title));
  if (pages.length !== 1) throw new Error(`Expected 1 page for ${title}, got ${pages.length}`);
  return pages[0];
}

function extractSectionRows(text: string, key: SectionKey) {
  if (key.startsWith("800-")) {
    const page = getPage(text, "NCH 800Metres Men");
    if (key === "800-heat-1" || key === "800-heat-2") {
      const start = page.indexOf("Heat1");
      const end = page.indexOf("Heat3");
      if (start < 0 || end < 0) throw new Error("Men's 800m heat1/heat2 block not found");
      const { leftRows, rightRows } = parseDualColumnBlock(page.slice(start, end));
      return key === "800-heat-1" ? leftRows : rightRows;
    }
    if (key === "800-heat-3") {
      const start = page.indexOf("Heat3");
      const end = page.indexOf("Final");
      if (start < 0 || end < 0) throw new Error("Men's 800m heat3 block not found");
      return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
    }
    const start = page.indexOf("Final");
    const end = page.indexOf("凡例");
    if (start < 0 || end < 0) throw new Error("Men's 800m final block not found");
    return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
  }

  if (key.startsWith("1500-")) {
    const page = getPage(text, "NCH 1500Metres Men");
    if (key === "1500-heat-1" || key === "1500-heat-2") {
      const start = page.indexOf("Heat1");
      const end = page.indexOf("Final");
      if (start < 0 || end < 0) throw new Error("Men's 1500m heat block not found");
      const { leftRows, rightRows } = parseDualColumnBlock(page.slice(start, end));
      return key === "1500-heat-1" ? leftRows : rightRows;
    }
    const start = page.indexOf("Final");
    const end = page.indexOf("凡例");
    if (start < 0 || end < 0) throw new Error("Men's 1500m final block not found");
    return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
  }

  const page = getPage(text, "NCH 3000Metres Steeplechase(0.914m) Men");
  const start = page.indexOf("Final");
  const end = page.indexOf("凡例");
  if (start < 0 || end < 0) throw new Error("Men's 3000mSC final block not found");
  return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
}

function resolvePersonSlug(name: string, lookups: Awaited<ReturnType<typeof loadPersonLookups>>) {
  const override = PERSON_SLUG_OVERRIDES.get(name);
  if (override) return override;
  const jaKey = normalizeJaForLookup(name);
  const jaMatch = lookups.jaMap.get(jaKey);
  if (jaMatch) return jaMatch;
  const romanKey = normalizeRomanLookup(name);
  const romanMatch = lookups.romanMap.get(romanKey);
  if (romanMatch) return romanMatch;
  return fallbackSlug("person-jch105-mid", name);
}

function resolveOrganization(label: string, lookup: Awaited<ReturnType<typeof loadOrganizationLookup>>) {
  const entityOverride = ORGANIZATION_ENTITY_OVERRIDES.get(label);
  if (entityOverride) return entityOverride;
  const normalized = normalizeOrganizationLabel(ORGANIZATION_LABEL_OVERRIDES.get(label) ?? label);
  const matched = lookup.get(normalized);
  if (matched) {
    return { slug: matched.slug, nameJa: matched.nameJa, type: mapOrganizationType(matched.type) } satisfies ResolvedOrganization;
  }
  return {
    slug: fallbackSlug("org-jch105-mid", normalized),
    nameJa: normalized,
    type: inferOrganizationType(normalized),
  } satisfies ResolvedOrganization;
}

async function buildPayload(
  text: string,
  section: SectionDefinition,
  orgLookup: Awaited<ReturnType<typeof loadOrganizationLookup>>,
  personLookups: Awaited<ReturnType<typeof loadPersonLookups>>,
) {
  const rows = extractSectionRows(text, section.key);
  const entries: RaceImportPayload["entries"] = rows.map((row) => {
    const personSlug = resolvePersonSlug(row.name, personLookups);
    const organization = resolveOrganization(row.organizationLabel, orgLookup);
    const notes = row.notes;
    const pbs = notes?.split(",").includes("PB")
      ? [{ discipline: section.discipline, mark: row.mark, sourceId: SOURCE_ID }]
      : [];

    return {
      slug: personSlug,
      displayNameJa: row.name,
      displayNameKana: null,
      displayNameRoman: null,
      raceOrganizationSlug: organization.slug,
      raceOrganizationNameJa: organization.nameJa,
      raceOrganizationType: organization.type,
      mark: row.mark,
      rank: row.rank,
      notes,
      pbs,
      sourceEntityKey: `${section.sourceEntityPrefix}-${row.bib}`,
      sourceUrl: SOURCE_URL,
    };
  });

  return raceImportPayloadSchema.parse({
    batchKey: `${section.raceSlug}-${BATCH_DATE}`,
    sourceId: SOURCE_ID,
    raceSlug: section.raceSlug,
    summary: `第105回日本陸上競技選手権大会 ${section.title} JAAF公式結果PDF import`,
    pbNotes: "JAAF公式総合結果PDFでは男子800m・男子1500m・男子3000mSCにPBコメントがあるため、PBコメント付きの結果のみPB反哺を行う。",
    entries,
  });
}

async function main() {
  await ensureSourceFiles();
  await mkdir(OUT_DIR, { recursive: true });

  const [text, orgLookup, personLookups] = await Promise.all([
    readFile(TEXT_PATH, "utf8"),
    loadOrganizationLookup(),
    loadPersonLookups(),
  ]);

  for (const section of SECTION_DEFINITIONS) {
    const payload = await buildPayload(text, section, orgLookup, personLookups);
    const outPath = path.join(OUT_DIR, `${section.raceSlug}.json`);
    await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`${section.raceSlug}: ${payload.entries.length}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
