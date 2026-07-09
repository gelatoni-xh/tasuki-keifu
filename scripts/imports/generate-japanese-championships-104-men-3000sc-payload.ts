import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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

const SOURCE_ID = "source-jch-104-3000sc-result";
const SOURCE_URL = "https://www.jaaf.or.jp/files/competition/document/1535-7.pdf";
const BATCH_DATE = "20260710";
const SOURCE_DIR = path.resolve("data/imports/japanese-championships-5000m-104-source");
const PDF_PATH = path.join(SOURCE_DIR, "result.pdf");
const TEXT_PATH = path.join(SOURCE_DIR, "result.txt");
const OUT_DIR = path.resolve("data/imports");
const RACE_SLUG = "japanese-championships-5000m-104-men-3000sc-final";

type OrgType = RaceImportPayload["entries"][number]["raceOrganizationType"];

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

const ORGANIZATION_LABEL_OVERRIDES = new Map<string, string>([
  ["愛三工業", "愛三工業"],
  ["阿見AC", "阿見AC"],
  ["ﾌﾟﾚｽ工業", "プレス工業"],
  ["山陽特殊製鋼", "山陽特殊製鋼"],
  ["SGHグループ", "SGホールディングス"],
  ["Honda", "Honda"],
  ["富士通", "富士通"],
  ["北星病院", "北星病院"],
  ["大塚製薬", "大塚製薬"],
  ["ﾄﾖﾀ自動車", "トヨタ自動車"],
]);

const PERSON_SLUG_OVERRIDES = new Map<string, string>([
  ["山口 浩勢", "person-hokuren2026abashiri-e5b1b1e58fa3e6b5a9e58ba2"],
  ["楠 康成", "person-hokuren2026abashiri-e6a5a020e5bab7e68890"],
  ["青木 涼真", "person-honda-aoki-ryoma"],
  ["滋野 聖也", "person-japan-running-news-2021-e6bb8be9878e20e88196e4b99f"],
  ["塩尻 和也", "shiociri-kazuya"],
  ["篠藤 淳", "person-jch105-mid-ef1422b7ed5c0de3c94e"],
  ["阪口 竜平", "person-japan-running-news-2021-e998aae58fa320e7ab9ce5b9b3"],
  ["潰滝 大記", "person-hokuren2026abashiri-e6bda4e6bb9d20e5a4a7e8a898"],
  ["神 直之", "person-japan-running-news-2021-e7a59e20e79bb4e4b98b"],
  ["松本 葵", "person-japan-running-news-2021-e69dbee69cace891b5"],
  ["近藤 聖志", "person-japan-running-news-2021-e8bf91e897a420e88196e5bf97"],
  ["打越 雄允", "person-japan-running-news-2021-e68993e8b68ae99b84e58581"],
  ["フィレモン キプラガット", "philemon-kiplagat"],
  ["荻野 太成", "person-hokuren2026abashiri-e88dbbe9878e20e5a4aae68890"],
]);

const DISPLAY_NAME_OVERRIDES = new Map<string, { ja: string; roman?: string | null }>([
  ["ﾌｨﾚﾓﾝ ｷﾌﾟﾗｶﾞｯﾄ", { ja: "フィレモン キプラガット", roman: null }],
  ["フィレモン キプラガット", { ja: "フィレモン キプラガット", roman: null }],
]);

const ORGANIZATION_ENTITY_OVERRIDES = new Map<string, { slug: string; nameJa: string; type: OrgType }>([
  ["阿見AC", { slug: "ami-athlete-club", nameJa: "阿見アスリートクラブ", type: "club" }],
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
  if (/(AC|RC|FC|TC|クラブ|陸協|協会)$/i.test(normalized)) return "club";
  return "corporate_team";
}

async function ensureSourceFiles() {
  await mkdir(SOURCE_DIR, { recursive: true });

  try {
    await access(PDF_PATH, constants.F_OK);
  } catch {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Failed to fetch source PDF: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(PDF_PATH, bytes);
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

function normalizeNotes(rawMark: string, remark?: string) {
  const [mark, inlineRemark] = rawMark.split(",", 2);
  if (mark === "DNS" || mark === "DNF" || mark === "DQ") {
    return inlineRemark || remark ? `${mark},${[inlineRemark, remark].filter(Boolean).join(",")}` : mark;
  }
  const tokens = [...(remark ? remark.split(",") : [])].map((token) => token.trim()).filter(Boolean);
  return tokens.length ? Array.from(new Set(tokens)).join(",") : null;
}

function parseResultRows(text: string) {
  const start = text.indexOf("3000Metres Steeplechase(0.914m) Men");
  const finalStart = text.indexOf("Final", start);
  const end = text.indexOf("凡例", finalStart);
  if (start < 0 || finalStart < 0 || end < 0) throw new Error("3000mSC final block not found");

  return text
    .slice(finalStart, end)
    .split(/\r?\n/)
    .map((line) => line.replace(/\f/g, "").trimEnd())
    .filter((line) => /^\s*(?:OP|\d+)?\s*\d+\s+\d+\s+\S/.test(line))
    .map((line) => {
      const compacted = normalizeDisplayNameJa(line);
      const matched = compacted.match(
        /^(?:(OP|\d+)\s+)?(\d+)\s+(\d+)\s+(.+?\(\d+\))\s+(.+?)\s+(DQ(?:,[A-Za-z0-9]+)?|DNS|DNF|\d{1,2}:\d{2}\.\d{2})(?:\s+([A-Za-z0-9,]+))?$/,
      );
      if (!matched) throw new Error(`Unexpected result row: ${line}`);
      const [, place, bib, , rawName, rawOrganization, rawMark, remark] = matched;
      const normalizedName = normalizeDisplayNameJa(rawName.replace(/\(\d+\)$/, "").trim());
      const override = DISPLAY_NAME_OVERRIDES.get(rawName.replace(/\(\d+\)$/, "").trim()) ?? DISPLAY_NAME_OVERRIDES.get(normalizedName);
      const name = override?.ja ?? normalizedName;
      const notes = normalizeNotes(rawMark, remark);
      const [mark] = rawMark.split(",", 1);
      return {
        bib,
        name,
        organizationLabel: normalizeDisplayNameJa(rawOrganization),
        mark,
        rank: !place || place === "OP" || mark === "DQ" || mark === "DNS" || mark === "DNF" ? null : Number(place),
        notes: place === "OP" ? ["OP", notes].filter(Boolean).join(",") : notes,
      } satisfies ParsedRow;
    });
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
  return fallbackSlug("person-jch104-3000sc", name);
}

function resolveOrganization(label: string, lookup: Awaited<ReturnType<typeof loadOrganizationLookup>>) {
  const entityOverride = ORGANIZATION_ENTITY_OVERRIDES.get(label);
  if (entityOverride) return entityOverride;
  const normalized = normalizeOrganizationLabel(ORGANIZATION_LABEL_OVERRIDES.get(label) ?? label);
  const matched = lookup.get(normalized);
  if (matched) {
    return { slug: matched.slug, nameJa: matched.nameJa, type: mapOrganizationType(matched.type) } satisfies ResolvedOrganization;
  }
  return { slug: fallbackSlug("org-jch104-3000sc", normalized), nameJa: normalized, type: inferOrganizationType(normalized) } satisfies ResolvedOrganization;
}

async function buildPayload(text: string, orgLookup: Awaited<ReturnType<typeof loadOrganizationLookup>>, personLookups: Awaited<ReturnType<typeof loadPersonLookups>>) {
  const rows = parseResultRows(text);
  const entries: RaceImportPayload["entries"] = rows.map((row) => {
    const personSlug = resolvePersonSlug(row.name, personLookups);
    const organization = resolveOrganization(row.organizationLabel, orgLookup);
    const pbs = row.notes?.split(",").includes("PB")
      ? [{ discipline: "m3000sc", mark: row.mark, sourceId: SOURCE_ID }]
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
      notes: row.notes,
      pbs,
      sourceEntityKey: `jch104-men-3000sc-final-${row.bib}`,
      sourceUrl: SOURCE_URL,
    };
  });

  return raceImportPayloadSchema.parse({
    batchKey: `${RACE_SLUG}-${BATCH_DATE}`,
    sourceId: SOURCE_ID,
    raceSlug: RACE_SLUG,
    summary: "第104回日本陸上競技選手権大会長距離 男子3000mSC決勝 JAAF公式結果PDF import",
    pbNotes: "JAAF公式結果PDFでは男子3000mSC決勝にPBコメントがあるため、PBコメント付きの結果のみPB反哺を行う。",
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

  const payload = await buildPayload(text, orgLookup, personLookups);
  const outPath = path.join(OUT_DIR, `${RACE_SLUG}.json`);
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`${RACE_SLUG}: ${payload.entries.length}`);
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
