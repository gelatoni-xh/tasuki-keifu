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

const SOURCE_ID = "source-jch-108-result";
const SOURCE_URL = "https://www.jaaf.or.jp/files/upload/202407/01_06270630all.pdf";
const BATCH_DATE = "20260710";
const SOURCE_DIR = path.resolve("data/imports/japanese-championships-5000m-108-source");
const PDF_PATH = path.join(SOURCE_DIR, "resultall.pdf");
const TEXT_PATH = path.join(SOURCE_DIR, "resultall.txt");
const OUT_DIR = path.resolve("data/imports");
const COLUMN_SPLIT = 63;
const LOCAL_CACHE_PDF_PATH = path.resolve("data/imports/jch-2024-resultall.pdf");

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
  { key: "800-heat-1", raceSlug: "japanese-championships-5000m-108-men-800-heat-1", sourceEntityPrefix: "jch108-men-800-heat1", title: "男子800m 予選1組", discipline: "m800" },
  { key: "800-heat-2", raceSlug: "japanese-championships-5000m-108-men-800-heat-2", sourceEntityPrefix: "jch108-men-800-heat2", title: "男子800m 予選2組", discipline: "m800" },
  { key: "800-heat-3", raceSlug: "japanese-championships-5000m-108-men-800-heat-3", sourceEntityPrefix: "jch108-men-800-heat3", title: "男子800m 予選3組", discipline: "m800" },
  { key: "800-final", raceSlug: "japanese-championships-5000m-108-men-800-final", sourceEntityPrefix: "jch108-men-800-final", title: "男子800m 決勝", discipline: "m800" },
  { key: "1500-heat-1", raceSlug: "japanese-championships-5000m-108-men-1500-heat-1", sourceEntityPrefix: "jch108-men-1500-heat1", title: "男子1500m 予選1組", discipline: "m1500" },
  { key: "1500-heat-2", raceSlug: "japanese-championships-5000m-108-men-1500-heat-2", sourceEntityPrefix: "jch108-men-1500-heat2", title: "男子1500m 予選2組", discipline: "m1500" },
  { key: "1500-final", raceSlug: "japanese-championships-5000m-108-men-1500-final", sourceEntityPrefix: "jch108-men-1500-final", title: "男子1500m 決勝", discipline: "m1500" },
  { key: "3000sc-final", raceSlug: "japanese-championships-5000m-108-men-3000sc-final", sourceEntityPrefix: "jch108-men-3000sc-final", title: "男子3000mSC 決勝", discipline: "m3000sc" },
];

const ORGANIZATION_LABEL_OVERRIDES = new Map<string, string>([
  ["ＧＭＯインターネットGrp", "GMOインターネットグループ"],
  ["GMOインターネットGrp", "GMOインターネットグループ"],
  ["ＳＭＩＬＥＹ", "SMILEY"],
  ["青学大", "青山学院大学"],
  ["中央大", "中央大学"],
  ["順天堂大", "順天堂大学"],
  ["東海大", "東海大学"],
  ["関西大", "関西大学"],
  ["山梨学院大", "山梨学院大学"],
  ["日本大", "日本大学"],
  ["鹿屋体育大", "鹿屋体育大学"],
  ["広島経済大", "広島経済大学"],
  ["近畿大", "近畿大学"],
  ["早稲田大", "早稲田大学"],
  ["日本体育大", "日本体育大学"],
  ["阿見AC", "阿見AC"],
  ["Ｋａｏ", "Kao"],
  ["DeNA", "DeNA"],
]);

const PERSON_SLUG_OVERRIDES = new Map<string, string>([
  ["前田 陽向", "person-e5898de794b020e999bde590"],
  ["早川 龍斗", "person-hokuren2024fukagawa-12024dafa2b06e36291e"],
  ["岡村 颯太", "person-kanaguri2026-e5b2a1e69d91e9a2afe5a4aa"],
  ["佐藤 主理", "person-kanaguri2026-e4bd90e897a4e4b8bbe79086"],
  ["石井 優吉", "ishii-yukichi"],
  ["井上 大輝", "inoue-daiki"],
  ["ｷﾋﾞﾘﾁ ｱﾚｯｸｽｷﾌﾟﾁﾙﾁﾙ", "kibilich-alex-kipchirchir"],
]);

const ORGANIZATION_ENTITY_OVERRIDES = new Map<string, { slug: string; nameJa: string; type: OrgType }>([
  ["SMILEY", { slug: "smiley", nameJa: "SMILEY", type: "club" }],
  ["Penn State", { slug: "penn-state", nameJa: "Penn State", type: "university" }],
  ["鹿屋体育大", { slug: "org-e9b9bfe5b18be4bd93e882b2", nameJa: "鹿屋体育大学", type: "university" }],
  ["宝塚市陸協", { slug: "takarazuka-rikukyo", nameJa: "宝塚市陸協", type: "club" }],
  ["株式会社FAJ", { slug: "faj", nameJa: "株式会社FAJ", type: "corporate_team" }],
  ["レデイ薬局", { slug: "lady-pharmacy", nameJa: "レデイ薬局", type: "corporate_team" }],
  ["ＴＡＫＥＯＡＣ", { slug: "takeo-ac", nameJa: "TAKEOAC", type: "club" }],
  ["KAGOTANI", { slug: "kagotani", nameJa: "KAGOTANI", type: "corporate_team" }],
  ["Team SSP", { slug: "team-ssp", nameJa: "Team SSP", type: "club" }],
  ["富士山の銘水", { slug: "fujisan-gx", nameJa: "富士山GX", type: "corporate_team" }],
  ["小森コーポ", { slug: "komori-corporation", nameJa: "小森コーポ", type: "corporate_team" }],
  ["アス・ラボ", { slug: "as-lab", nameJa: "アス・ラボ", type: "club" }],
  ["コモディイイダ", { slug: "comodi-iida", nameJa: "コモディイイダ", type: "corporate_team" }],
]);

function compactForSlug(value: string) {
  return value.normalize("NFKC").replace(/[ 　]/g, "").trim();
}

function fallbackSlug(prefix: string, value: string) {
  const compacted = compactForSlug(value);
  const ascii = compacted.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ascii && (ascii.length >= 6 || ascii === compacted.toLowerCase())) {
    return `${prefix}-${ascii}`;
  }
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
  if (/(AC|RC|FC|TC|クラブ|陸協|Team)$/i.test(normalized)) return "club";
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

  if (!tokens.length) {
    return null;
  }

  return Array.from(new Set(tokens)).join(",");
}

function parseSingleColumnLine(line: string) {
  const compacted = normalizeDisplayNameJa(line);
  const matched = compacted.match(
    /^(?:(OP|\d+)\s+)?(\d+)\s+([A-Z0-9]+)\s+(.+?\(\d+\))\s+(.+?)\s+(DNS|DNF|\d{1,2}:\d{2}\.\d{2})(?:\s+([A-Za-z0-9,]+))?(?:\s+([A-Za-z0-9]+))?$/,
  );
  if (!matched) {
    throw new Error(`Unexpected result row: ${line}`);
  }

  const [, place, , bib, rawName, rawOrganization, mark, remark, qualifier] = matched;
  const name = normalizeDisplayNameJa(rawName.replace(/\(\d+\)$/, "").trim());
  const organizationLabel = normalizeDisplayNameJa(rawOrganization);
  const isOp = place === "OP";
  const notes = normalizeNotes(remark, qualifier, isOp) ?? (mark === "DNS" || mark === "DNF" ? mark : null);

  return {
    bib,
    name,
    organizationLabel,
    mark,
    rank: !place || isOp ? null : Number(place),
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

function indexOfPattern(page: string, pattern: RegExp) {
  const matched = page.match(pattern);
  return matched?.index ?? -1;
}

function extractSectionRows(text: string, key: SectionKey) {
  if (key.startsWith("800-")) {
    const page = getPage(text, "日本選手権男子800m");
    if (key === "800-heat-1" || key === "800-heat-2") {
      const start = indexOfPattern(page, /\n1組\s+2組/);
      const end = page.lastIndexOf("3組");
      if (start < 0 || end < 0) throw new Error("Men's 800m heat1/heat2 block not found");
      const { leftRows, rightRows } = parseDualColumnBlock(page.slice(start, end));
      return key === "800-heat-1" ? leftRows : rightRows;
    }
    if (key === "800-heat-3") {
      const start = indexOfPattern(page, /\n3組\s*\n順位/);
      const end = indexOfPattern(page, /\n決\s+勝/);
      if (start < 0 || end < 0) throw new Error("Men's 800m heat3 block not found");
      return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
    }
    const start = indexOfPattern(page, /\n決\s+勝/);
    const end = page.indexOf("凡例");
    if (start < 0 || end < 0) throw new Error("Men's 800m final block not found");
    return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
  }

  if (key.startsWith("1500-")) {
    const pages = splitPages(text);
    const heatPage = pages.find((page) => page.includes("日本選手権男子1500m") && page.includes("予"));
    const finalPage = splitPages(text).find((page) => page.includes("日本選手権男子1500m") && page.includes("決     勝"));
    if (!heatPage || !finalPage) throw new Error("Men's 1500m pages not found");

    if (key === "1500-heat-1" || key === "1500-heat-2") {
      const start = indexOfPattern(heatPage, /\n1組\s+2組/);
      const end = heatPage.indexOf("凡例");
      if (start < 0 || end < 0) throw new Error("Men's 1500m heat block not found");
      const { leftRows, rightRows } = parseDualColumnBlock(heatPage.slice(start, end));
      return key === "1500-heat-1" ? leftRows : rightRows;
    }

    const start = indexOfPattern(finalPage, /\n決\s+勝/);
    const end = finalPage.indexOf("凡例");
    if (start < 0 || end < 0) throw new Error("Men's 1500m final block not found");
    return extractRowLines(finalPage.slice(start, end)).map(parseSingleColumnLine);
  }

  const page = getPage(text, "日本選手権男子3000mSC(0.914m)");
  const start = indexOfPattern(page, /\n決\s+勝/);
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
  return fallbackSlug("person-jch108-mid", name);
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
    slug: fallbackSlug("org-jch108-mid", normalized),
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
    const pbs =
      notes?.split(",").includes("PB")
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
      rank: row.mark === "DNS" || row.mark === "DNF" ? null : row.rank,
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
    summary: `第108回日本陸上競技選手権大会 ${section.title} JAAF公式結果PDF import`,
    pbNotes: "JAAF公式総合結果PDFでは男子800m・男子1500mにPBコメントがあるため、PBコメント付きの結果のみPB反哺を行う。男子3000mSCはPBコメントがないためPB反哺は行わない。",
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
