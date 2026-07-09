import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { OrganizationType, PrismaClient, type EventDiscipline } from "@prisma/client";

import { raceImportPayloadSchema, type RaceImportPayload } from "../lib/import-types";
import { loadWorkspaceEnv } from "../lib/load-env";
import { normalizeDisplayNameJa, normalizeJaForLookup, normalizePersonDisplayNameJa } from "../lib/name-normalization";
import { normalizeOrganizationLabel } from "../lib/organization-normalization";

loadWorkspaceEnv();

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

const SOURCE_ID = "source-japan-intercollegiate-championships-2023-results";
const BATCH_DATE = "20260709";
const SOURCE_DIR = path.resolve("data/imports/japan-intercollegiate-championships-2023-source");
const OUT_DIR = path.resolve("data/imports");

type OrgType = RaceImportPayload["entries"][number]["raceOrganizationType"];

type RaceDefinition = {
  raceSlug: string;
  displayName: string;
  discipline: EventDiscipline;
  sourceEntityPrefix: string;
  url: string;
};

type ParsedRow = {
  bib: string;
  name: string;
  kana: string | null;
  organizationLabel: string;
  grade: number | null;
  rank: number | null;
  mark: string;
  notes: string | null;
};

type LookupOrganizationRow = {
  slug: string;
  nameJa: string;
  type: OrganizationType;
};

type PersonLookupEntry = {
  slug: string;
  organizationSlugs: Set<string>;
};

const RACE_DEFINITIONS: RaceDefinition[] = [
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-heat-1",
    displayName: "男子800m 予選1組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-heat-1",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel026.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-heat-2",
    displayName: "男子800m 予選2組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-heat-2",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel027.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-heat-3",
    displayName: "男子800m 予選3組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-heat-3",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel028.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-heat-4",
    displayName: "男子800m 予選4組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-heat-4",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel029.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-heat-5",
    displayName: "男子800m 予選5組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-heat-5",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel030.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-heat-6",
    displayName: "男子800m 予選6組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-heat-6",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel031.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-heat-7",
    displayName: "男子800m 予選7組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-heat-7",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel032.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-semifinal-1",
    displayName: "男子800m 準決勝1組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-semifinal-1",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel200.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-semifinal-2",
    displayName: "男子800m 準決勝2組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-semifinal-2",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel201.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-semifinal-3",
    displayName: "男子800m 準決勝3組",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-semifinal-3",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel202.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-800-final",
    displayName: "男子800m 決勝",
    discipline: "m800",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-800-final",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel214.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-1500-heat-1",
    displayName: "男子1500m 予選1組",
    discipline: "m1500",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-1500-heat-1",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel033.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-1500-heat-2",
    displayName: "男子1500m 予選2組",
    discipline: "m1500",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-1500-heat-2",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel034.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-1500-heat-3",
    displayName: "男子1500m 予選3組",
    discipline: "m1500",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-1500-heat-3",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel035.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-1500-final",
    displayName: "男子1500m 決勝",
    discipline: "m1500",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-1500-final",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel176.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-5000-final",
    displayName: "男子5000m 決勝",
    discipline: "m5000",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-5000-final",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel036.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-10000-final",
    displayName: "男子10000m 決勝",
    discipline: "m10000",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-10000-final",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel037.html",
  },
  {
    raceSlug: "japan-intercollegiate-championships-2023-men-3000sc-final",
    displayName: "男子3000mSC 決勝",
    discipline: "m3000sc",
    sourceEntityPrefix: "japan-intercollegiate-championships-2023-men-3000sc-final",
    url: "https://www.iuau.jp/ev2023/92ic/res/rel049.html",
  },
];

const ORGANIZATION_LABEL_OVERRIDES = new Map<string, string>([
  ["秋田大", "秋田大学"],
  ["愛知教育大", "愛知教育大学"],
  ["石川工業高専", "石川工業高等専門学校"],
  ["埼玉大", "埼玉大学"],
  ["群馬大", "群馬大学"],
  ["岐阜大", "岐阜大学"],
  ["神戸大", "神戸大学"],
  ["金沢学院大", "金沢学院大学"],
  ["京都大", "京都大学"],
  ["関西大", "関西大学"],
  ["関西学院大", "関西学院大学"],
  ["関東学院大", "関東学院大学"],
  ["國學院大", "國學院大學"],
  ["城西大", "城西大学"],
  ["順天堂大", "順天堂大学"],
  ["大阪体育大", "大阪体育大学"],
  ["湘南工科大", "湘南工科大学"],
  ["仙台大", "仙台大学"],
  ["室蘭工業大", "室蘭工業大学"],
  ["松本大", "松本大学"],
  ["青山学院大", "青山学院大学"],
  ["早稲田大", "早稲田大学"],
  ["専修大", "専修大学"],
  ["創価大", "創価大学"],
  ["中央学院大", "中央学院大学"],
  ["中京大", "中京大学"],
  ["東海大", "東海大学"],
  ["東京学芸大", "東京学芸大学"],
  ["東京国際大", "東京国際大学"],
  ["東洋大", "東洋大学"],
  ["同志社大", "同志社大学"],
  ["日本福祉大", "日本福祉大学"],
  ["第一工科大", "第一工科大学"],
  ["日本体育大", "日本体育大学"],
  ["日本大", "日本大学"],
  ["北海道教育大", "北海道教育大学"],
  ["広島修道大", "広島修道大学"],
  ["福岡大", "福岡大学"],
  ["びわこ学院大", "びわこ学院大学"],
  ["法政大", "法政大学"],
  ["明治大", "明治大学"],
  ["立教大", "立教大学"],
  ["立命館大", "立命館大学"],
  ["流通経済大", "流通経済大学"],
  ["鹿屋体育大", "鹿屋体育大学"],
]);

const ORGANIZATION_SLUG_OVERRIDES = new Map<
  string,
  {
    slug: string;
    nameJa: string;
    type: OrgType;
  }
>([
  [
    "秋田大学",
    {
      slug: "akita-university",
      nameJa: "秋田大学",
      type: "university",
    },
  ],
  [
    "愛知教育大学",
    {
      slug: "aichi-university-of-education",
      nameJa: "愛知教育大学",
      type: "university",
    },
  ],
  [
    "大阪体育大学",
    {
      slug: "osaka-university-of-health-and-sport-sciences",
      nameJa: "大阪体育大学",
      type: "university",
    },
  ],
  [
    "岐阜大学",
    {
      slug: "gifu-university",
      nameJa: "岐阜大学",
      type: "university",
    },
  ],
  [
    "石川工業高等専門学校",
    {
      slug: "ishikawa-national-college-of-technology",
      nameJa: "石川工業高等専門学校",
      type: "university",
    },
  ],
  [
    "神戸大学",
    {
      slug: "kobe-university",
      nameJa: "神戸大学",
      type: "university",
    },
  ],
  [
    "鹿屋体育大学",
    {
      slug: "org-e9b9bfe5b18be4bd93e882b2",
      nameJa: "鹿屋体育大学",
      type: "university",
    },
  ],
  [
    "仙台大学",
    {
      slug: "org-hokuren2023shibetsu-5cddec4ba03ae7cdf111",
      nameJa: "仙台大学",
      type: "university",
    },
  ],
  [
    "日本福祉大学",
    {
      slug: "nihon-fukushi-university",
      nameJa: "日本福祉大学",
      type: "university",
    },
  ],
  [
    "室蘭工業大学",
    {
      slug: "muroran-institute-of-technology",
      nameJa: "室蘭工業大学",
      type: "university",
    },
  ],
  [
    "広島修道大学",
    {
      slug: "hiroshima-shudo-university",
      nameJa: "広島修道大学",
      type: "university",
    },
  ],
  [
    "福岡大学",
    {
      slug: "fukuoka-university",
      nameJa: "福岡大学",
      type: "university",
    },
  ],
  [
    "びわこ学院大学",
    {
      slug: "biwako-gakuin-university",
      nameJa: "びわこ学院大学",
      type: "university",
    },
  ],
  [
    "湘南工科大学",
    {
      slug: "org-hokuren2023shibetsu-22041fd1557cce5f7991",
      nameJa: "湘南工科大学",
      type: "university",
    },
  ],
  [
    "第一工科大学",
    {
      slug: "org-e7acace4b880e5b7a5e7a791",
      nameJa: "第一工科大学",
      type: "university",
    },
  ],
  [
    "北海道教育大学",
    {
      slug: "org-hokuren2025fukagawa-5226f0280c3ae43b59af",
      nameJa: "北海道教育大学",
      type: "university",
    },
  ],
  [
    "埼玉大学",
    {
      slug: "saitama-university",
      nameJa: "埼玉大学",
      type: "university",
    },
  ],
  [
    "群馬大学",
    {
      slug: "gunma-university",
      nameJa: "群馬大学",
      type: "university",
    },
  ],
  [
    "金沢学院大学",
    {
      slug: "kanazawa-gakuin-university",
      nameJa: "金沢学院大学",
      type: "university",
    },
  ],
  [
    "松本大学",
    {
      slug: "matsumoto-university",
      nameJa: "松本大学",
      type: "university",
    },
  ],
  [
    "東京学芸大学",
    {
      slug: "tokyo-gakugei-university",
      nameJa: "東京学芸大学",
      type: "university",
    },
  ],
]);

const PERSON_SLUG_OVERRIDES = new Map<string, string>([
  ["花谷そら", "person-6a6170616e2d73747564656e742d756e696f6e2d73656c6563742de88ab1e8b0b720e3819de38289"],
  ["本光健裕", "person-kanaguri2024-e69cace58589e581a5e8a395"],
  ["鮎川翔", "person-kanaguri2025-e9ae8ee5b79de7bf94"],
  ["樋爪友哉", "person-kanaguri2026-e6a88be788aae58f8be59389"],
]);

function compactForSlug(value: string) {
  return value.normalize("NFKC").replace(/[ 　]/g, "").trim();
}

function fallbackSlug(prefix: string, value: string) {
  const compacted = compactForSlug(value);
  const lowered = compacted.toLowerCase();

  if (/^[a-z0-9-]+$/.test(lowered) && lowered.length >= 6) {
    return `${prefix}-${lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  }

  return `${prefix}-${createHash("sha1").update(compacted).digest("hex").slice(0, 20)}`;
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

function htmlToText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseAcademicSuffixGrade(value: string) {
  const normalized = value.toUpperCase();

  if (/^(?:[1-9]|10)$/.test(normalized)) {
    return Number(normalized);
  }

  const masterMatch = normalized.match(/^M(\d)$/);
  if (masterMatch) {
    return 4 + Number(masterMatch[1]);
  }

  const doctorMatch = normalized.match(/^D(\d)$/);
  if (doctorMatch) {
    return 6 + Number(doctorMatch[1]);
  }

  return null;
}

function normalizeMark(value: string) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  return lines[0]!;
}

function normalizeKana(value: string) {
  const normalized = normalizeDisplayNameJa(value.normalize("NFKC"));
  const stripped = normalized.replace(/\([A-Za-z0-9]+\)$/u, "").trim();
  return stripped || null;
}

async function ensureSourceHtml(definition: RaceDefinition) {
  await mkdir(SOURCE_DIR, { recursive: true });

  const fileName = `${definition.raceSlug}.html`;
  const filePath = path.join(SOURCE_DIR, fileName);

  try {
    await access(filePath, constants.F_OK);
    return readFile(filePath, "utf8");
  } catch {
    const response = await fetch(definition.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${definition.url}: ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const html = new TextDecoder("shift_jis").decode(bytes);
    await writeFile(filePath, html, "utf8");
    return html;
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

  const lookup = new Map<string, LookupOrganizationRow | null>();

  for (const row of rows) {
    const keys = new Set<string>([
      normalizeOrganizationLabel(row.nameJa),
      ...(row.shortName ? [normalizeOrganizationLabel(row.shortName)] : []),
      ...row.nameVariants.map((variant) => normalizeOrganizationLabel(variant.value)),
    ]);

    for (const key of keys) {
      const mapped = { slug: row.slug, nameJa: row.nameJa, type: row.type };
      const current = lookup.get(key);

      if (!current) {
        lookup.set(key, mapped);
        continue;
      }

      if (current.slug !== mapped.slug) {
        lookup.set(key, null);
      }
    }
  }

  return lookup;
}

async function loadPersonLookup() {
  const people = await prisma.person.findMany({
    select: {
      slug: true,
      displayNameJa: true,
      memberships: {
        select: {
          organization: {
            select: { slug: true },
          },
        },
      },
      raceResults: {
        where: {
          organizationId: { not: null },
        },
        select: {
          organization: {
            select: { slug: true },
          },
        },
      },
    },
  });

  const lookup = new Map<string, PersonLookupEntry[]>();

  for (const person of people) {
    const normalizedName = normalizeJaForLookup(person.displayNameJa);
    const entry: PersonLookupEntry = {
      slug: person.slug,
      organizationSlugs: new Set(
        [
          ...person.memberships.map((membership) => membership.organization.slug),
          ...person.raceResults.map((result) => result.organization?.slug).filter((slug): slug is string => Boolean(slug)),
        ],
      ),
    };

    const current = lookup.get(normalizedName) ?? [];
    current.push(entry);
    lookup.set(normalizedName, current);
  }

  return lookup;
}

function resolveOrganization(label: string, lookup: Awaited<ReturnType<typeof loadOrganizationLookup>>) {
  const normalizedLabel = ORGANIZATION_LABEL_OVERRIDES.get(label) ?? label;
  const slugOverride = ORGANIZATION_SLUG_OVERRIDES.get(normalizedLabel);
  if (slugOverride) {
    return slugOverride;
  }

  const key = normalizeOrganizationLabel(normalizedLabel);
  const matched = lookup.get(key);

  if (matched === null) {
    throw new Error(`Ambiguous organization match: ${label}`);
  }

  if (matched) {
    return {
      slug: matched.slug,
      nameJa: matched.nameJa,
      type: mapOrganizationType(matched.type),
    };
  }

  return {
    slug: fallbackSlug("org-jiic2023", normalizedLabel),
    nameJa: normalizedLabel,
    type: "university" as OrgType,
  };
}

function resolvePersonSlug(
  displayNameJa: string,
  organizationSlug: string,
  lookup: Awaited<ReturnType<typeof loadPersonLookup>>,
) {
  const override = PERSON_SLUG_OVERRIDES.get(displayNameJa);
  if (override) {
    return override;
  }

  const normalizedName = normalizeJaForLookup(displayNameJa);
  const candidates = lookup.get(normalizedName) ?? [];

  if (candidates.length === 0) {
    return fallbackSlug("person-jiic2023", `${organizationSlug}-${displayNameJa}`);
  }

  const matchingOrganization = candidates.filter((candidate) => candidate.organizationSlugs.has(organizationSlug));
  if (matchingOrganization.length === 1) {
    return matchingOrganization[0]!.slug;
  }
  if (matchingOrganization.length > 1) {
    throw new Error(
      `Ambiguous existing people for ${displayNameJa} @ ${organizationSlug}: ${matchingOrganization.map((candidate) => candidate.slug).join(", ")}`,
    );
  }

  if (candidates.length === 1) {
    return candidates[0]!.slug;
  }

  throw new Error(`Ambiguous existing people for ${displayNameJa}: ${candidates.map((candidate) => candidate.slug).join(", ")}`);
}

function parseRows(html: string) {
  const resultTableMatch = html.match(/<a name="CONTENTS"><\/a>\s*<table>([\s\S]*?)<\/table>/);
  if (!resultTableMatch) {
    throw new Error("Could not locate main result table");
  }

  const rows = [...resultTableMatch[1]!.matchAll(/<tr class="trmen[12]">([\s\S]*?)<\/tr>/g)];

  return rows.map((match) => {
    const cells = [...match[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => htmlToText(cell[1]!));
    if (cells.length !== 8) {
      throw new Error(`Unexpected cell count: ${cells.length}`);
    }

    const rankText = cells[0]!;
    const bib = cells[2]!;
    const rawName = normalizeDisplayNameJa(cells[3]!.normalize("NFKC"));
    const rawKana = normalizeKana(cells[4]!);
    const organizationLines = cells[5]!
      .split("\n")
      .map((line) => normalizeDisplayNameJa(line.normalize("NFKC")))
      .filter(Boolean);
    const organizationLabel = organizationLines[0] ?? "";
    const rawMark = normalizeMark(cells[6]!);
    const comment = normalizeDisplayNameJa(cells[7]!).replace(/\s+/g, " ").trim() || null;
    const gradeMatch = rawName.match(/^(.*?)(?:\s*\(([A-Za-z]?\d+)\))$/u);
    const baseName = gradeMatch ? gradeMatch[1]! : rawName;
    const grade = gradeMatch ? parseAcademicSuffixGrade(gradeMatch[2]!) : null;
    const mark = rawMark || comment || "";
    const notes = comment && comment !== mark ? comment : (mark === "DNS" || mark === "DNF" || mark === "OP" ? mark : null);
    const rank = mark === "DNS" || mark === "DNF" || mark === "OP" ? null : (rankText ? Number(rankText) : null);

    if (!mark) {
      throw new Error(`Missing mark for bib ${bib}`);
    }

    return {
      bib,
      name: normalizePersonDisplayNameJa(baseName),
      kana: rawKana,
      organizationLabel,
      grade,
      rank,
      mark,
      notes,
    } satisfies ParsedRow;
  });
}

async function buildPayload(
  definition: RaceDefinition,
  organizationLookup: Awaited<ReturnType<typeof loadOrganizationLookup>>,
  personLookup: Awaited<ReturnType<typeof loadPersonLookup>>,
) {
  const html = await ensureSourceHtml(definition);
  const rows = parseRows(html);

  const entries: RaceImportPayload["entries"] = rows.map((row) => {
    const organization = resolveOrganization(row.organizationLabel, organizationLookup);
    const slug = resolvePersonSlug(row.name, organization.slug, personLookup);

    return {
      slug,
      displayNameJa: row.name,
      displayNameKana: row.kana,
      displayNameRoman: null,
      raceOrganizationSlug: organization.slug,
      raceOrganizationNameJa: organization.nameJa,
      raceOrganizationType: organization.type,
      universitySlug: organization.type === "university" ? organization.slug : null,
      universityNameJa: organization.type === "university" ? organization.nameJa : null,
      grade: row.grade,
      mark: row.mark,
      rank: row.rank,
      notes: row.notes,
      pbs: [],
      sourceEntityKey: `${definition.sourceEntityPrefix}-${row.bib}`,
      sourceUrl: definition.url,
    };
  });

  return raceImportPayloadSchema.parse({
    batchKey: `${definition.raceSlug}-${BATCH_DATE}`,
    sourceId: SOURCE_ID,
    raceSlug: definition.raceSlug,
    summary: `天皇賜盃第92回日本学生陸上競技対校選手権 ${definition.displayName} IUAU公式結果HTML import`,
    pbNotes: "IUAU公式HTML結果ページ。PB/SB表記はソースにないため反映していない。Q/q/DNS/DNF/YCなどの公式コメントはnotesに反映した。",
    entries,
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const [organizationLookup, personLookup] = await Promise.all([
    loadOrganizationLookup(),
    loadPersonLookup(),
  ]);

  for (const definition of RACE_DEFINITIONS) {
    const payload = await buildPayload(definition, organizationLookup, personLookup);
    const outPath = path.join(OUT_DIR, `${definition.raceSlug}.json`);
    await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`${definition.raceSlug}: ${payload.entries.length}`);
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
