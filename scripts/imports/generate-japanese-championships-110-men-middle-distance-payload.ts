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

const SOURCE_ID = "source-jch-110-result";
const SOURCE_URL = "https://www.jaaf.or.jp/files/upload/202606/resultall.pdf";
const BATCH_DATE = "20260710";
const SOURCE_DIR = path.resolve("data/imports/japanese-championships-5000m-110-source");
const PDF_PATH = path.join(SOURCE_DIR, "resultall.pdf");
const TEXT_PATH = path.join(SOURCE_DIR, "resultall.txt");
const OUT_DIR = path.resolve("data/imports");
const COLUMN_SPLIT = 76;
const LOCAL_CACHE_PDF_PATH = path.resolve("data/imports/jch-2026-resultall.pdf");

type OrgType = RaceImportPayload["entries"][number]["raceOrganizationType"];

type SectionDefinition = {
  key:
    | "800-heat-1"
    | "800-heat-2"
    | "800-heat-3"
    | "800-final"
    | "1500-heat-1"
    | "1500-heat-2"
    | "1500-final"
    | "3000sc-final";
  raceSlug: string;
  sourceEntityPrefix: string;
  title: string;
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
  {
    key: "800-heat-1",
    raceSlug: "japanese-championships-5000m-110-men-800-heat-1",
    sourceEntityPrefix: "jch110-men-800-heat1",
    title: "男子800m 予選1組",
  },
  {
    key: "800-heat-2",
    raceSlug: "japanese-championships-5000m-110-men-800-heat-2",
    sourceEntityPrefix: "jch110-men-800-heat2",
    title: "男子800m 予選2組",
  },
  {
    key: "800-heat-3",
    raceSlug: "japanese-championships-5000m-110-men-800-heat-3",
    sourceEntityPrefix: "jch110-men-800-heat3",
    title: "男子800m 予選3組",
  },
  {
    key: "800-final",
    raceSlug: "japanese-championships-5000m-110-men-800-final",
    sourceEntityPrefix: "jch110-men-800-final",
    title: "男子800m 決勝",
  },
  {
    key: "1500-heat-1",
    raceSlug: "japanese-championships-5000m-110-men-1500-heat-1",
    sourceEntityPrefix: "jch110-men-1500-heat1",
    title: "男子1500m 予選1組",
  },
  {
    key: "1500-heat-2",
    raceSlug: "japanese-championships-5000m-110-men-1500-heat-2",
    sourceEntityPrefix: "jch110-men-1500-heat2",
    title: "男子1500m 予選2組",
  },
  {
    key: "1500-final",
    raceSlug: "japanese-championships-5000m-110-men-1500-final",
    sourceEntityPrefix: "jch110-men-1500-final",
    title: "男子1500m 決勝",
  },
  {
    key: "3000sc-final",
    raceSlug: "japanese-championships-5000m-110-men-3000sc-final",
    sourceEntityPrefix: "jch110-men-3000sc-final",
    title: "男子3000mSC 決勝",
  },
];

const ORGANIZATION_LABEL_OVERRIDES = new Map<string, string>([
  ["GMOインターネットGrp", "GMOインターネットグループ"],
  ["ＳＧＨ", "SGホールディングス"],
  ["青学大", "青山学院大学"],
  ["中央大", "中央大学"],
  ["順天堂大", "順天堂大学"],
  ["帝京大", "帝京大学"],
  ["東海大", "東海大学"],
  ["東海学園大", "東海学園大学"],
  ["明治大", "明治大学"],
  ["城西大", "城西大学"],
  ["慶應義塾大", "慶應義塾大学"],
  ["関西大", "関西大学"],
  ["立教大", "立教大学"],
  ["志學館大", "志學館大学"],
  ["鹿屋体育大", "鹿屋体育大学"],
  ["関西学院大", "関西学院大学"],
  ["早稲田大", "早稲田大学"],
  ["筑波大", "筑波大学"],
  ["法政大", "法政大学"],
  ["育英大", "育英大学"],
  ["ＪＦＥスチール", "JFEスチール"],
  ["NIKE", "Nike"],
]);

const PERSON_SLUG_OVERRIDES = new Map<string, string>([
  ["中川 拓海", "person-e4b8ade5b79d20e68b93e6b5"],
  ["樋口 諒", "higuchi-ryo"],
  ["川澄 克弥", "kawasumi-katsuya"],
]);

const ORGANIZATION_ENTITY_OVERRIDES = new Map<
  string,
  {
    slug: string;
    nameJa: string;
    type: OrgType;
  }
>([
  ["鹿屋体育大", { slug: "org-e9b9bfe5b18be4bd93e882b2", nameJa: "鹿屋体育大学", type: "university" }],
  ["鹿屋体育大学", { slug: "org-e9b9bfe5b18be4bd93e882b2", nameJa: "鹿屋体育大学", type: "university" }],
  ["スマイスセレソン", { slug: "smyth-cerezo", nameJa: "スマイスセレソン", type: "club" }],
  ["薬王堂IIIF", { slug: "yakuodo-iiif", nameJa: "薬王堂IIIF", type: "corporate_team" }],
  ["杏林堂薬局", { slug: "kyorindo-pharmacy", nameJa: "杏林堂薬局", type: "corporate_team" }],
  ["在外個人", { slug: "overseas-individual", nameJa: "在外個人", type: "club" }],
  ["日立", { slug: "hitachi", nameJa: "日立", type: "corporate_team" }],
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
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  if (/大学|^.+大$/.test(normalized)) {
    return "university";
  }
  if (/高校|^.+高$/.test(normalized)) {
    return "high_school";
  }
  if (/(AC|RC|クラブ|G|TP|Lab)$/i.test(normalized)) {
    return "club";
  }

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
      if (!response.ok) {
        throw new Error(`Failed to fetch source PDF: ${response.status}`);
      }
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
    select: {
      slug: true,
      nameJa: true,
      type: true,
      shortName: true,
      nameVariants: {
        select: {
          value: true,
        },
      },
    },
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

      if (current.slug !== mapped.slug) {
        keyMap.set(key, null);
      }
    }
  }

  return keyMap;
}

async function loadPersonLookups() {
  const rows = await prisma.person.findMany({
    select: {
      slug: true,
      displayNameJaSearch: true,
      displayNameRoman: true,
    },
  });

  const jaMap = new Map<string, string | null>();
  const romanMap = new Map<string, string | null>();

  for (const row of rows) {
    const currentJa = jaMap.get(row.displayNameJaSearch);
    if (!currentJa) {
      jaMap.set(row.displayNameJaSearch, row.slug);
    } else if (currentJa !== row.slug) {
      jaMap.set(row.displayNameJaSearch, null);
    }

    if (row.displayNameRoman) {
      const key = normalizeRomanLookup(row.displayNameRoman);
      const currentRoman = romanMap.get(key);
      if (!currentRoman) {
        romanMap.set(key, row.slug);
      } else if (currentRoman !== row.slug) {
        romanMap.set(key, null);
      }
    }
  }

  return { jaMap, romanMap };
}

function splitPages(text: string) {
  return text
    .split("\f")
    .map((page) => page.trim())
    .filter(Boolean);
}

function parseSingleColumnLine(line: string) {
  const compacted = normalizeDisplayNameJa(line);
  const matched = compacted.match(
    /^(?:(\d+)\s+)?(\d+)\s+(\d+)\s+(.+?\(\d+\))\s+(.+?)\s+(DNS|DNF|\d{1,2}:\d{2}\.\d{2})(?:\s+([A-Za-z0-9,\s]+))?$/,
  );

  if (!matched) {
    throw new Error(`Unexpected result row: ${line}`);
  }

  const [, place, , bib, rawName, rawOrganization, mark, remark] = matched;
  const name = normalizeDisplayNameJa(rawName.replace(/\(\d+\)$/, "").trim());
  const organizationLabel = normalizeDisplayNameJa(rawOrganization);
  const normalizedRemark = remark?.trim().replace(/\s+/g, ",").replace(/,+/g, ",") ?? null;
  const notes = normalizedRemark ?? (mark === "DNS" || mark === "DNF" ? mark : null);

  return {
    bib,
    name,
    organizationLabel,
    mark,
    rank: place ? Number(place) : null,
    notes,
  } satisfies ParsedRow;
}

function extractRowLines(block: string) {
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/\f/g, "").trimEnd())
    .filter((line) => /^\s*(?:\d+\s+)?\d+\s+\d+\s+\S/.test(line));
}

function parseDualColumnBlock(block: string) {
  const leftRows: ParsedRow[] = [];
  const rightRows: ParsedRow[] = [];

  for (const line of block.split(/\r?\n/)) {
    const raw = line.replace(/\f/g, "");
    if (!raw.trim()) {
      continue;
    }

    const left = raw.slice(0, COLUMN_SPLIT).trimEnd();
    const right = raw.slice(COLUMN_SPLIT).trimEnd();

    if (/^\s*(?:\d+\s+)?\d+\s+\d+\s+\S/.test(left)) {
      leftRows.push(parseSingleColumnLine(left));
    }
    if (/^\s*(?:\d+\s+)?\d+\s+\d+\s+\S/.test(right)) {
      rightRows.push(parseSingleColumnLine(right));
    }
  }

  return { leftRows, rightRows };
}

function getPage(text: string, title: string) {
  const pages = splitPages(text).filter((page) => page.includes(title));
  if (pages.length !== 1) {
    throw new Error(`Expected 1 page for ${title}, got ${pages.length}`);
  }
  return pages[0];
}

function extractSectionRows(text: string, key: SectionDefinition["key"]) {
  if (key.startsWith("800-")) {
    const page = getPage(text, "NCH Men's 800Metres");

    if (key === "800-heat-1" || key === "800-heat-2") {
      const start = page.indexOf("Heat1");
      const end = page.indexOf("Heat3");
      if (start < 0 || end < 0) {
        throw new Error("Men's 800m heat1/heat2 block not found");
      }
      const { leftRows, rightRows } = parseDualColumnBlock(page.slice(start, end));
      return key === "800-heat-1" ? leftRows : rightRows;
    }

    if (key === "800-heat-3") {
      const start = page.indexOf("Heat3");
      const end = page.indexOf("Final");
      if (start < 0 || end < 0) {
        throw new Error("Men's 800m heat3 block not found");
      }
      return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
    }

    const start = page.indexOf("Final");
    const end = page.indexOf("凡例");
    if (start < 0 || end < 0) {
      throw new Error("Men's 800m final block not found");
    }
    return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
  }

  if (key.startsWith("1500-")) {
    const page = getPage(text, "NCH Men's 1500Metres");

    if (key === "1500-heat-1" || key === "1500-heat-2") {
      const start = page.indexOf("Heat1");
      const end = page.indexOf("Final");
      if (start < 0 || end < 0) {
        throw new Error("Men's 1500m heat block not found");
      }
      const { leftRows, rightRows } = parseDualColumnBlock(page.slice(start, end));
      return key === "1500-heat-1" ? leftRows : rightRows;
    }

    const start = page.indexOf("Final");
    const end = page.indexOf("凡例");
    if (start < 0 || end < 0) {
      throw new Error("Men's 1500m final block not found");
    }
    return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
  }

  const page = getPage(text, "NCH Men's 3000Metres Steeplechase(0.914m)");
  const start = page.indexOf("Final");
  const end = page.indexOf("凡例");
  if (start < 0 || end < 0) {
    throw new Error("Men's 3000mSC final block not found");
  }
  return extractRowLines(page.slice(start, end)).map(parseSingleColumnLine);
}

function resolvePersonSlug(
  name: string,
  lookups: Awaited<ReturnType<typeof loadPersonLookups>>,
) {
  const override = PERSON_SLUG_OVERRIDES.get(name);
  if (override) {
    return override;
  }

  const jaKey = normalizeJaForLookup(name);
  const jaMatch = lookups.jaMap.get(jaKey);
  if (jaMatch) {
    return jaMatch;
  }

  const romanKey = normalizeRomanLookup(name);
  const romanMatch = lookups.romanMap.get(romanKey);
  if (romanMatch) {
    return romanMatch;
  }

  return fallbackSlug("person-jch110-mid", name);
}

function resolveOrganization(
  label: string,
  lookup: Awaited<ReturnType<typeof loadOrganizationLookup>>,
) {
  const entityOverride = ORGANIZATION_ENTITY_OVERRIDES.get(label);
  if (entityOverride) {
    return entityOverride;
  }

  const normalized = normalizeOrganizationLabel(ORGANIZATION_LABEL_OVERRIDES.get(label) ?? label);
  const matched = lookup.get(normalized);

  if (matched) {
    return {
      slug: matched.slug,
      nameJa: matched.nameJa,
      type: mapOrganizationType(matched.type),
    } satisfies ResolvedOrganization;
  }

  return {
    slug: fallbackSlug("org-jch110-mid", normalized),
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
      notes: row.notes,
      pbs: [],
      sourceEntityKey: `${section.sourceEntityPrefix}-${row.bib}`,
      sourceUrl: SOURCE_URL,
    };
  });

  return raceImportPayloadSchema.parse({
    batchKey: `${section.raceSlug}-${BATCH_DATE}`,
    sourceId: SOURCE_ID,
    raceSlug: section.raceSlug,
    summary: `第110回日本陸上競技選手権大会 ${section.title} JAAF公式結果PDF import`,
    pbNotes: "JAAF公式総合結果PDFには男子800m・男子1500m・男子3000mSCのPB/SB欄がないため、PB反哺は行っていない。",
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
