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

const SOURCE_ID = "source-nittaidai-long-distance-meet-327-results";
const BASE_URL = "https://nittai-honbu.pecori.jp/nittai-result/0411%20327L/shtml/";
const TAIKAI_URL = `${BASE_URL}Taikai.json`;
const TIMETABLE_URL = `${BASE_URL}TimeTable.json`;
const BATCH_DATE = "20260714";
const SOURCE_DIR = path.resolve("data/imports/nittaidai-long-distance-meet-327-source");
const OUT_DIR = path.resolve("data/imports");
const FETCH_CACHE = new Map<string, Promise<unknown>>();

type OrgType = RaceImportPayload["entries"][number]["raceOrganizationType"];
type LookupOrganizationRow = { slug: string; nameJa: string; type: OrganizationType };
type PersonLookupEntry = { slug: string; organizationSlugs: Set<string> };
type TimeTableRow = { No: string; KaishiJikan: string; KyogiMei: string; KumiNo: string; LinkRound: string; LinkKumi: string };
type ResultRow = { No: string; KyogishaMei: string; ShozokuMei: string; Kiroku: string; Jyuni: string; Comment: string; Biko: string; DnsFlg: string };
type ResultGroup = { Status: string; ResultList: ResultRow[] };
type ResultTrack = { SubTitle: string; ResultInfo: Record<string, ResultGroup[]> };
type RaceDefinition = {
  raceSlug: string;
  displayName: string;
  discipline: EventDiscipline;
  sourceEntityPrefix: string;
  resultUrl: string;
  resultAnchor: string;
  groupIndex: number;
};

const ALLOWED_EVENTS = new Set([
  "男子800m",
  "男子1500m",
  "男子5000m",
  "NCG男子800m",
  "NCG男子1500m",
  "NCG男子5000m",
]);

const PERSON_SLUG_OVERRIDES = new Map<string, string>([
  ["桑原 大地", "person-nittaidai327-ac0a0777128b13477117"],
  ["桑原大地", "person-nittaidai327-ac0a0777128b13477117"],
  ["田母神 一喜", "person-kanaguri2021-e794b0e6af8de7a59ee4b880e5969c"],
  ["田母神一喜", "person-kanaguri2021-e794b0e6af8de7a59ee4b880e5969c"],
  ["滋野 聖也", "person-press-kogyo-554e2fa4"],
  ["滋野聖也", "person-press-kogyo-554e2fa4"],
  ["藤井 雄大", "person-e897a4e4ba9520e99b84e5a4"],
  ["藤井雄大", "person-e897a4e4ba9520e99b84e5a4"],
  ["荒井 七海", "person-kanaguri2025-e88d92e4ba95e4b883e6b5b7"],
  ["荒井七海", "person-kanaguri2025-e88d92e4ba95e4b883e6b5b7"],
  ["飯島 陸斗", "person-kanaguri2024-e9a3afe5b3b6e999b8e69697"],
  ["飯島陸斗", "person-kanaguri2024-e9a3afe5b3b6e999b8e69697"],
  ["井上 大輝", "inoue-daiki"],
  ["井上大輝", "inoue-daiki"],
]);

const PERSON_ORG_SLUG_OVERRIDES = new Map<string, string>([
  ["生駒蓮::tokyo-international-university", "person-nittaidai327-dac6d2f38c6a4738ea7a"],
]);

const ORGANIZATION_LABEL_OVERRIDES = new Map<string, string>([
  ["NTT ExCパートナーグルー", "NTT ExCパートナーグループ"],
  ["東京田徑協會", "東京陸上競技協会"],
]);

const ORGANIZATION_SLUG_OVERRIDES = new Map<string, { slug: string; nameJa: string; type: OrgType }>([
  ["ワークマン", { slug: "org-kanaguri2025-e383afe383bce382afe3839ee383b3", nameJa: "ワークマン", type: "corporate_team" }],
]);

function compactForSlug(value: string) {
  return value.normalize("NFKC").replace(/[ 　]/g, "").trim();
}

function fallbackSlug(prefix: string, value: string) {
  const compacted = compactForSlug(value);
  const lowered = compacted.toLowerCase();
  const ascii = lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ascii && (ascii.length >= 6 || ascii === lowered)) return `${prefix}-${ascii}`;
  return `${prefix}-${createHash("sha1").update(compacted).digest("hex").slice(0, 20)}`;
}

function normalizeHtmlText(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/&nbsp;/g, " ").replace(/&#160;/g, " ").trim();
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
  if (/中学/u.test(normalized)) return "junior_high_school";
  if (/高校|高等学校|中等学校|^.+高$/u.test(normalized) || /school/i.test(label)) return "high_school";
  if (/大学|^.+大$/u.test(normalized)) return "university";
  if (/(クラブ|AC|RC|TC|陸協|協会|協會)$/iu.test(normalized) || /club/i.test(label)) return "club";
  if (/県庁$/u.test(normalized)) return "company";
  return "corporate_team";
}

function notesFromRow(row: ResultRow) {
  const parts = [row.Comment, row.Biko].map((v) => normalizeDisplayNameJa(v.normalize("NFKC")).trim()).filter(Boolean);
  return [...new Set(parts)].join(" / ") || null;
}

function normalizeMark(row: ResultRow) {
  const mark = normalizeDisplayNameJa(row.Kiroku.normalize("NFKC")).trim();
  if (mark) return mark;
  const comment = normalizeDisplayNameJa(row.Comment.normalize("NFKC")).trim();
  if (comment) return comment;
  if (row.DnsFlg === "1") return "DNS";
  throw new Error(`Missing mark for bib ${row.No}`);
}

function parseNameHtml(value: string) {
  const lines = normalizeHtmlText(value).split("\n").map((line) => normalizeDisplayNameJa(line.normalize("NFKC"))).filter(Boolean);
  if (lines.length === 0) throw new Error(`Missing athlete name: ${value}`);
  const kana = lines.length > 1 ? lines[0]! : null;
  const sourceName = lines.length > 1 ? lines[1]! : lines[0]!;
  const name = normalizePersonDisplayNameJa(sourceName.replace(/[（(][^）)]*[）)]$/u, "").trim());
  return { displayNameJa: name, displayNameKana: kana };
}

function parseOrganizationHtml(value: string) {
  const lines = normalizeHtmlText(value).split("\n").map((line) => normalizeDisplayNameJa(line.normalize("NFKC"))).filter(Boolean);
  if (lines.length === 0) throw new Error(`Missing organization: ${value}`);
  return lines[0]!;
}

async function fetchJsonWithCache<T>(url: string, fileName: string) {
  const cached = FETCH_CACHE.get(url);
  if (cached) return cached as Promise<T>;

  const loader = (async () => {
  await mkdir(SOURCE_DIR, { recursive: true });
  const filePath = path.join(SOURCE_DIR, fileName);
  try {
    await access(filePath, constants.F_OK);
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const json = (await response.json()) as T;
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    return json;
  }
  })();

  FETCH_CACHE.set(url, loader);
  return loader;
}

async function loadOrganizationLookup() {
  const rows = await prisma.organization.findMany({
    select: {
      slug: true,
      nameJa: true,
      type: true,
      shortName: true,
      nameVariants: { select: { value: true } },
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
      if (current.slug !== mapped.slug) lookup.set(key, null);
    }
  }
  return lookup;
}

async function loadPersonLookup() {
  const people = await prisma.person.findMany({
    select: {
      slug: true,
      displayNameJa: true,
      memberships: { select: { organization: { select: { slug: true } } } },
      raceResults: {
        where: { organizationId: { not: null } },
        select: { organization: { select: { slug: true } } },
      },
    },
  });
  const lookup = new Map<string, PersonLookupEntry[]>();
  for (const person of people) {
    const normalizedName = normalizeJaForLookup(person.displayNameJa);
    const entry: PersonLookupEntry = {
      slug: person.slug,
      organizationSlugs: new Set([
        ...person.memberships.map((membership) => membership.organization.slug),
        ...person.raceResults.map((result) => result.organization?.slug).filter((slug): slug is string => Boolean(slug)),
      ]),
    };
    const current = lookup.get(normalizedName) ?? [];
    current.push(entry);
    lookup.set(normalizedName, current);
  }
  return lookup;
}

function resolveOrganization(label: string, lookup: Awaited<ReturnType<typeof loadOrganizationLookup>>) {
  const directOverride = ORGANIZATION_SLUG_OVERRIDES.get(label);
  if (directOverride) return directOverride;
  const normalizedLabel = ORGANIZATION_LABEL_OVERRIDES.get(label) ?? label;
  const key = normalizeOrganizationLabel(normalizedLabel);
  const matched = lookup.get(key);
  if (matched === null) throw new Error(`Ambiguous organization match: ${normalizedLabel}`);
  if (matched) return { slug: matched.slug, nameJa: matched.nameJa, type: mapOrganizationType(matched.type) };
  return {
    slug: fallbackSlug("org-nittaidai327", normalizedLabel),
    nameJa: normalizedLabel,
    type: inferOrganizationType(normalizedLabel),
  };
}

function resolvePersonSlug(displayNameJa: string, organizationSlug: string, lookup: Awaited<ReturnType<typeof loadPersonLookup>>) {
  const orgScopedOverride = PERSON_ORG_SLUG_OVERRIDES.get(`${displayNameJa}::${organizationSlug}`);
  if (orgScopedOverride) return orgScopedOverride;
  const override = PERSON_SLUG_OVERRIDES.get(displayNameJa);
  if (override) return override;
  const normalizedName = normalizeJaForLookup(displayNameJa);
  const candidates = lookup.get(normalizedName) ?? [];
  if (candidates.length === 0) {
    return `person-nittaidai327-${createHash("sha1").update(`${organizationSlug}|${displayNameJa}`).digest("hex").slice(0, 20)}`;
  }
  const matchingOrganization = candidates.filter((candidate) => candidate.organizationSlugs.has(organizationSlug));
  if (matchingOrganization.length === 1) return matchingOrganization[0]!.slug;
  if (matchingOrganization.length > 1) {
    throw new Error(`Ambiguous existing people for ${displayNameJa} @ ${organizationSlug}: ${matchingOrganization.map((candidate) => candidate.slug).join(", ")}`);
  }
  if (candidates.length === 1) return candidates[0]!.slug;
  throw new Error(`Ambiguous existing people for ${displayNameJa}: ${candidates.map((candidate) => candidate.slug).join(", ")}`);
}

function toRaceDefinition(row: TimeTableRow) {
  const isNcg = row.KyogiMei.startsWith("NCG");
  const baseName = isNcg ? row.KyogiMei.replace(/^NCG/u, "") : row.KyogiMei;
  const distanceMatch = baseName.match(/(800|1500|5000)m$/u);
  if (!distanceMatch) throw new Error(`Unexpected discipline label: ${row.KyogiMei}`);
  const distance = distanceMatch[1]!;
  const discipline = (`m${distance}`) as EventDiscipline;
  const groupIndex = Number(row.KumiNo);
  const resultUrl = new URL(row.LinkRound.replace(/^\.\//u, ""), BASE_URL).toString();
  const resultAnchor = `kumi_${groupIndex}`;

  if (isNcg && distance === "5000" && groupIndex === 2) {
    return {
      raceSlug: "nittaidai-long-distance-meet-327-ncg-men-5000-heat-2",
      displayName: "NCG男子5000m 2組",
      discipline,
      sourceEntityPrefix: "nittaidai-327-ncg-men-5000-2",
      resultUrl,
      resultAnchor,
      groupIndex,
    } satisfies RaceDefinition;
  }

  if (isNcg && distance === "1500" && groupIndex === 2) {
    return {
      raceSlug: "nittaidai-long-distance-meet-327-ncg-men-1500-heat-2",
      displayName: "NCG男子1500m 2組",
      discipline,
      sourceEntityPrefix: "nittaidai-327-ncg-men-1500-2",
      resultUrl,
      resultAnchor,
      groupIndex,
    } satisfies RaceDefinition;
  }

  if (isNcg) {
    return {
      raceSlug: `nittaidai-long-distance-meet-327-ncg-men-${distance}`,
      displayName: row.KyogiMei,
      discipline,
      sourceEntityPrefix: `nittaidai-327-ncg-men-${distance}`,
      resultUrl,
      resultAnchor,
      groupIndex,
    } satisfies RaceDefinition;
  }

  return {
    raceSlug: `nittaidai-long-distance-meet-327-men-${distance}-heat-${groupIndex}`,
    displayName: `${row.KyogiMei} ${groupIndex}組`,
    discipline,
    sourceEntityPrefix: `nittaidai-327-men-${distance}-${groupIndex}`,
    resultUrl,
    resultAnchor,
    groupIndex,
  } satisfies RaceDefinition;
}

async function loadRaceDefinitions() {
  await fetchJsonWithCache(TAIKAI_URL, "Taikai.json");
  const timetable = await fetchJsonWithCache<{ TimeTableList: Record<string, Record<string, Record<string, { TimeTable?: TimeTableRow[] }>>> }>(
    TIMETABLE_URL,
    "TimeTable.json",
  );
  const deduped = new Map<string, TimeTableRow>();
  for (const day of Object.values(timetable.TimeTableList)) {
    for (const shumoku of Object.values(day)) {
      for (const block of Object.values(shumoku)) {
        for (const row of block.TimeTable ?? []) {
          if (!ALLOWED_EVENTS.has(row.KyogiMei)) continue;
          if (!deduped.has(row.LinkKumi)) deduped.set(row.LinkKumi, row);
        }
      }
    }
  }
  return [...deduped.values()]
    .sort((left, right) => Number(left.No) - Number(right.No))
    .map(toRaceDefinition);
}

function parseRaceRows(result: ResultTrack, definition: RaceDefinition) {
  const groups = result.ResultInfo["1"];
  if (!groups) throw new Error(`Missing rank-sorted ResultInfo for ${definition.raceSlug}`);
  const group = groups[definition.groupIndex - 1];
  if (!group) throw new Error(`Missing group ${definition.groupIndex} for ${definition.raceSlug}`);
  return group.ResultList.map((row) => {
    const { displayNameJa, displayNameKana } = parseNameHtml(row.KyogishaMei);
    const organizationLabel = parseOrganizationHtml(row.ShozokuMei);
    const mark = normalizeMark(row);
    const notes = notesFromRow(row);
    const rankText = normalizeDisplayNameJa(row.Jyuni.normalize("NFKC")).trim();
    return {
      bib: row.No,
      displayNameJa,
      displayNameKana,
      organizationLabel,
      rank: /^\d+$/u.test(rankText) ? Number(rankText) : null,
      mark,
      notes,
    };
  });
}

async function buildPayload(definition: RaceDefinition, organizationLookup: Awaited<ReturnType<typeof loadOrganizationLookup>>, personLookup: Awaited<ReturnType<typeof loadPersonLookup>>) {
  const resultJsonUrl = definition.resultUrl.replace(/\.html$/u, ".json");
  const result = await fetchJsonWithCache<ResultTrack>(resultJsonUrl, `${definition.raceSlug}.json`);
  const rows = parseRaceRows(result, definition);
  const entries: RaceImportPayload["entries"] = rows.map((row) => {
    const organization = resolveOrganization(row.organizationLabel, organizationLookup);
    const slug = resolvePersonSlug(row.displayNameJa, organization.slug, personLookup);
    return {
      slug,
      displayNameJa: row.displayNameJa,
      displayNameKana: row.displayNameKana,
      displayNameRoman: null,
      raceOrganizationSlug: organization.slug,
      raceOrganizationNameJa: organization.nameJa,
      raceOrganizationType: organization.type,
      universitySlug: organization.type === "university" ? organization.slug : null,
      universityNameJa: organization.type === "university" ? organization.nameJa : null,
      highSchoolSlug: organization.type === "high_school" ? organization.slug : null,
      highSchoolNameJa: organization.type === "high_school" ? organization.nameJa : null,
      mark: row.mark,
      rank: row.rank,
      notes: row.notes,
      pbs: [],
      sourceEntityKey: `${definition.sourceEntityPrefix}-${row.bib}`,
      sourceUrl: `${definition.resultUrl}#${definition.resultAnchor}`,
    };
  });
  return raceImportPayloadSchema.parse({
    batchKey: `${definition.raceSlug}-${BATCH_DATE}`,
    sourceId: SOURCE_ID,
    raceSlug: definition.raceSlug,
    summary: `第327回日本体育大学長距離競技会兼20th NITTAIDAI Challenge Games ${definition.displayName} PECORI公式結果JSON import`,
    pbNotes: "PECORI公式結果JSON。PB/SB表記はソースにないため反映していない。DNS/DNF/DQ/欠などの公式注記はnotesに保持した。",
    entries,
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const [raceDefinitions, organizationLookup, personLookup] = await Promise.all([
    loadRaceDefinitions(),
    loadOrganizationLookup(),
    loadPersonLookup(),
  ]);
  for (const definition of raceDefinitions) {
    const payload = await buildPayload(definition, organizationLookup, personLookup);
    const outPath = path.join(OUT_DIR, `${definition.raceSlug}.json`);
    await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`${definition.raceSlug}: ${payload.entries.length}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  }).finally(async () => {
    await prisma.$disconnect();
  });
}
