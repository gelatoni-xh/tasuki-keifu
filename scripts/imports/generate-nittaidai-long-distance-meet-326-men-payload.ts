import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { OrganizationType, PrismaClient, type EventDiscipline } from "@prisma/client";

import { raceImportPayloadSchema, type RaceImportPayload } from "../lib/import-types";
import { loadWorkspaceEnv } from "../lib/load-env";
import { normalizeDisplayNameJa, normalizeJaForLookup, normalizePersonDisplayNameJa } from "../lib/name-normalization";
import { normalizeOrganizationLabel } from "../lib/organization-normalization";

loadWorkspaceEnv();

const execFileAsync = promisify(execFile);

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

const SOURCE_ID = "source-nittaidai-long-distance-meet-326-results";
const SOURCE_PAGE_URL = "http://games.nssu-athletic.com/tf.html";
const RESULT_PDF_URL = "http://games.nssu-athletic.com/games_tf/152result.pdf";
const PROGRAM_PDF_URL = "http://games.nssu-athletic.com/games_tf/152program.pdf";
const TIMETABLE_PDF_URL = "http://games.nssu-athletic.com/games_tf/152timetable.pdf";
const BATCH_DATE = "20260714";
const SOURCE_DIR = path.resolve("data/imports/nittaidai-long-distance-meet-326-source");
const RESULT_PDF_PATH = path.join(SOURCE_DIR, "152result.pdf");
const RESULT_TEXT_PATH = path.join(SOURCE_DIR, "152result.txt");
const PROGRAM_PDF_PATH = path.join(SOURCE_DIR, "152program.pdf");
const PROGRAM_TEXT_PATH = path.join(SOURCE_DIR, "152program.txt");
const TIMETABLE_PDF_PATH = path.join(SOURCE_DIR, "152timetable.pdf");
const LOCAL_RESULT_PDF_PATH = "/tmp/152result.pdf";
const LOCAL_PROGRAM_PDF_PATH = "/tmp/152program.pdf";
const LOCAL_TIMETABLE_PDF_PATH = "/tmp/152timetable.pdf";
const OUT_DIR = path.resolve("data/imports");

type OrgType = RaceImportPayload["entries"][number]["raceOrganizationType"];

type LookupOrganizationRow = {
  slug: string;
  nameJa: string;
  type: OrganizationType;
};

type PersonLookupEntry = {
  slug: string;
  organizationSlugs: Set<string>;
};

type RaceDefinition = {
  raceSlug: string;
  displayName: string;
  discipline: EventDiscipline;
  sourceEntityPrefix: string;
  eventHeader: string;
  heat: string;
  sourceUrl: string;
};

type ProgramEntry = {
  displayNameJa: string;
  organizationLabel: string;
};

type ParsedResultRow = {
  bib: string;
  rank: number | null;
  mark: string;
  notes: string | null;
};

const EVENT_HEADER_TO_DISCIPLINE = new Map<string, EventDiscipline>([
  ["男子800m", "m800"],
  ["男子1500m", "m1500"],
  ["男子3000m", "m3000"],
]);

const RACE_DEFINITIONS: RaceDefinition[] = [
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-1500-heat-1",
    displayName: "男子1500m 1組",
    discipline: "m1500",
    sourceEntityPrefix: "nittaidai-326-men-1500-1",
    eventHeader: "男子1500m",
    heat: "1",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-1500-heat-2",
    displayName: "男子1500m 2組",
    discipline: "m1500",
    sourceEntityPrefix: "nittaidai-326-men-1500-2",
    eventHeader: "男子1500m",
    heat: "2",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-1500-heat-3",
    displayName: "男子1500m 3組",
    discipline: "m1500",
    sourceEntityPrefix: "nittaidai-326-men-1500-3",
    eventHeader: "男子1500m",
    heat: "3",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-1500-heat-4",
    displayName: "男子1500m 4組",
    discipline: "m1500",
    sourceEntityPrefix: "nittaidai-326-men-1500-4",
    eventHeader: "男子1500m",
    heat: "4",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-1500-heat-5",
    displayName: "男子1500m 5組",
    discipline: "m1500",
    sourceEntityPrefix: "nittaidai-326-men-1500-5",
    eventHeader: "男子1500m",
    heat: "5",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-800-heat-1",
    displayName: "男子800m 1組",
    discipline: "m800",
    sourceEntityPrefix: "nittaidai-326-men-800-1",
    eventHeader: "男子800m",
    heat: "1",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-800-heat-2",
    displayName: "男子800m 2組",
    discipline: "m800",
    sourceEntityPrefix: "nittaidai-326-men-800-2",
    eventHeader: "男子800m",
    heat: "2",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-3000-heat-1",
    displayName: "男子3000m 1組",
    discipline: "m3000",
    sourceEntityPrefix: "nittaidai-326-men-3000-1",
    eventHeader: "男子3000m",
    heat: "1",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-3000-heat-2",
    displayName: "男子3000m 2組",
    discipline: "m3000",
    sourceEntityPrefix: "nittaidai-326-men-3000-2",
    eventHeader: "男子3000m",
    heat: "2",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-3000-heat-3",
    displayName: "男子3000m 3組",
    discipline: "m3000",
    sourceEntityPrefix: "nittaidai-326-men-3000-3",
    eventHeader: "男子3000m",
    heat: "3",
    sourceUrl: RESULT_PDF_URL,
  },
  {
    raceSlug: "nittaidai-long-distance-meet-326-men-3000-heat-4",
    displayName: "男子3000m 4組",
    discipline: "m3000",
    sourceEntityPrefix: "nittaidai-326-men-3000-4",
    eventHeader: "男子3000m",
    heat: "4",
    sourceUrl: RESULT_PDF_URL,
  },
];

const PERSON_SLUG_OVERRIDES = new Map<string, string>([
  ["荒井 七海", "person-kanaguri2025-e88d92e4ba95e4b883e6b5b7"],
  ["荒井七海", "person-kanaguri2025-e88d92e4ba95e4b883e6b5b7"],
  ["井上 大輝", "inoue-daiki"],
  ["井上大輝", "inoue-daiki"],
]);

const PERSON_ORG_SLUG_OVERRIDES = new Map<string, string>([
  ["小島 大輝::tokai-university-sagami-high-school", "person-e5b08fe5b3b620e5a4a7e8bc"],
  ["小島大輝::tokai-university-sagami-high-school", "person-e5b08fe5b3b620e5a4a7e8bc"],
]);

const ORGANIZATION_LABEL_OVERRIDES = new Map<string, string>([
  ["青学大", "青山学院大学"],
  ["中央大", "中央大学"],
  ["城西大", "城西大学"],
  ["関西創価高", "関西創価高校"],
  ["九州学院高", "九州学院高校"],
  ["京産大附", "京都産業大学附属高校"],
  ["酒井南高", "酒田南高校"],
  ["駒大", "駒澤大学"],
  ["埼玉医科大学G", "埼玉医科大学グループ"],
  ["ＧＭＯインターネットＧ", "GMOインターネットグループ"],
  ["ジーケーライン", "GKライン"],
  ["鹿島学園高", "鹿島学園高校"],
  ["佐久長聖高", "佐久長聖高校"],
  ["テイキョウ大学", "帝京大学"],
  ["東海大相模高", "東海大学付属相模高校"],
  ["土浦日大中等", "土浦日本大学中等教育学校"],
  ["ＮＤソフト", "NDソフト"],
  ["ＮＴＴ ExCﾊﾟｰﾄﾅｰG", "NTT ExCパートナーグループ"],
  ["NTT ExCﾊﾟｰﾄﾅｰG", "NTT ExCパートナーグループ"],
  ["信州大学", "信州大学"],
  ["小林高", "小林高校"],
  ["学法石川高", "学法石川高校"],
  ["千葉大", "千葉大学"],
  ["埼玉陸協", "埼玉陸上競技協会"],
  ["東京陸協", "東京陸上競技協会"],
  ["稲生高", "稲生高校"],
  ["日本ｳｪﾙﾈｽ大", "日本ウェルネススポーツ大学"],
  ["日体大", "日本体育大学"],
  ["明大同", "明治大学陸上競技同好会"],
  ["横浜市陸協", "横浜市陸上競技協会"],
  ["流経大", "流通経済大学"],
  ["法大", "法政大学"],
  ["立大", "立教大学"],
  ["育英大", "育英大学"],
  ["仙台育英高", "仙台育英高校"],
  ["早大同好会", "早稲田大学陸上競技同好会"],
  ["駿河台大", "駿河台大学"],
]);

const ORGANIZATION_SLUG_OVERRIDES = new Map<string, { slug: string; nameJa: string; type: OrgType }>([
  ["ワークマン", { slug: "org-kanaguri2025-e383afe383bce382afe3839ee383b3", nameJa: "ワークマン", type: "corporate_team" }],
]);

const MANUAL_RESULT_OVERRIDES = new Map<string, ParsedResultRow>([
  ["男子1500m::1::2976", { bib: "2976", rank: 5, mark: "4:01.80", notes: null }],
  ["男子1500m::1::1364", { bib: "1364", rank: 10, mark: "4:07.35", notes: null }],
  ["男子3000m::4::6515", { bib: "6515", rank: 13, mark: "DNS", notes: "DNS" }],
]);

const MANUAL_PROGRAM_ENTRY_OVERRIDES = new Map<string, ProgramEntry>([
  ["男子3000m::1::3584::17::8:52.68", { displayNameJa: "藤原想太", organizationLabel: "日本体育大学" }],
]);

const SKIPPED_ROWS = new Set(["男子1500m::5::3537"]);

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
  if (/中学/u.test(normalized)) return "junior_high_school";
  if (/高校|高等学校|中等教育学校|中等学校|^.+高$/u.test(normalized)) return "high_school";
  if (/大学|^.+大$/u.test(normalized)) return "university";
  if (/(クラブ|AC|RC|project|Project|MORE|Ist|MABP|GX|G)$/iu.test(normalized)) return "club";
  if (/陸協|競技協会/u.test(normalized)) return "club";
  if (/銀行|電工|ガス|自動車|製鋼|コーポレーション|パートナーグループ|グループ|ワークマン/u.test(normalized)) {
    return "corporate_team";
  }
  return "corporate_team";
}

function normalizeNotes(mark: string) {
  if (mark === "DNS" || mark === "DNF") return mark;
  if (mark.startsWith("DQ")) return mark;
  return null;
}

async function ensureSourceFiles() {
  await mkdir(SOURCE_DIR, { recursive: true });

  const files = [
    { url: RESULT_PDF_URL, pdfPath: RESULT_PDF_PATH, textPath: RESULT_TEXT_PATH, localCachePath: LOCAL_RESULT_PDF_PATH },
    { url: PROGRAM_PDF_URL, pdfPath: PROGRAM_PDF_PATH, textPath: PROGRAM_TEXT_PATH, localCachePath: LOCAL_PROGRAM_PDF_PATH },
    { url: TIMETABLE_PDF_URL, pdfPath: TIMETABLE_PDF_PATH, textPath: null, localCachePath: LOCAL_TIMETABLE_PDF_PATH },
  ] as const;

  for (const file of files) {
    try {
      await access(file.pdfPath, constants.F_OK);
    } catch {
      try {
        await access(file.localCachePath, constants.F_OK);
        await copyFile(file.localCachePath, file.pdfPath);
      } catch {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`Failed to fetch ${file.url}: ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        await writeFile(file.pdfPath, bytes);
      }
    }
    if (!file.textPath) continue;
    try {
      await access(file.textPath, constants.F_OK);
    } catch {
      await execFileAsync("pdftotext", ["-layout", file.pdfPath, file.textPath]);
    }
  }
}

async function loadOrganizationLookup(labels: string[]) {
  const normalizedLabels = [...new Set(labels.map((label) => normalizeOrganizationFromSource(label)))];
  const rows = await prisma.organization.findMany({
    where: {
      OR: [
        { nameJa: { in: normalizedLabels } },
        { shortName: { in: normalizedLabels } },
        { nameVariants: { some: { value: { in: normalizedLabels } } } },
      ],
    },
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

async function loadPersonLookup(names: string[]) {
  const exactNames = [...new Set(names.flatMap((name) => [name, name.replace(/[ 　]/gu, "")]))];
  const people = await prisma.person.findMany({
    where: {
      displayNameJa: { in: exactNames },
    },
    select: {
      slug: true,
      displayNameJa: true,
      displayNameRoman: true,
      memberships: { select: { organization: { select: { slug: true } } } },
      raceResults: {
        where: { organizationId: { not: null } },
        select: { organization: { select: { slug: true } } },
      },
    },
  });

  const byName = new Map<string, PersonLookupEntry[]>();
  const byRoman = new Map<string, PersonLookupEntry[]>();

  for (const person of people) {
    const entry: PersonLookupEntry = {
      slug: person.slug,
      organizationSlugs: new Set([
        ...person.memberships.map((membership) => membership.organization.slug),
        ...person.raceResults.map((result) => result.organization?.slug).filter((slug): slug is string => Boolean(slug)),
      ]),
    };

    const nameKey = normalizeJaForLookup(person.displayNameJa);
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), entry]);

    if (!person.displayNameRoman) continue;
    const romanKey = normalizeRomanLookup(person.displayNameRoman);
    byRoman.set(romanKey, [...(byRoman.get(romanKey) ?? []), entry]);
  }

  return { byName, byRoman };
}

function normalizeOrganizationFromSource(label: string) {
  const normalized = normalizeDisplayNameJa(label.normalize("NFKC")).trim();
  return ORGANIZATION_LABEL_OVERRIDES.get(normalized) ?? normalized;
}

function resolveOrganization(label: string, lookup: Awaited<ReturnType<typeof loadOrganizationLookup>>) {
  const override = ORGANIZATION_SLUG_OVERRIDES.get(label);
  if (override) return override;
  const normalizedLabel = normalizeOrganizationFromSource(label);
  const matched = lookup.get(normalizeOrganizationLabel(normalizedLabel));
  if (matched === null) throw new Error(`Ambiguous organization match: ${normalizedLabel}`);
  if (matched) return { slug: matched.slug, nameJa: matched.nameJa, type: mapOrganizationType(matched.type) };
  return {
    slug: fallbackSlug("org-nittaidai326", normalizedLabel),
    nameJa: normalizedLabel,
    type: inferOrganizationType(normalizedLabel),
  };
}

function resolvePersonSlug(
  displayNameJa: string,
  displayNameRoman: string | null,
  organizationSlug: string,
  lookup: Awaited<ReturnType<typeof loadPersonLookup>>,
) {
  const override = PERSON_SLUG_OVERRIDES.get(displayNameJa);
  if (override) return override;
  const orgScopedOverride = PERSON_ORG_SLUG_OVERRIDES.get(`${displayNameJa}::${organizationSlug}`);
  if (orgScopedOverride) return orgScopedOverride;

  const nameKey = normalizeJaForLookup(displayNameJa);
  const byName = lookup.byName.get(nameKey) ?? [];
  const byOrg = byName.filter((candidate) => candidate.organizationSlugs.has(organizationSlug));
  if (byOrg.length === 1) return byOrg[0]!.slug;
  if (byOrg.length > 1) {
    throw new Error(`Ambiguous existing people for ${displayNameJa} @ ${organizationSlug}: ${byOrg.map((candidate) => candidate.slug).join(", ")}`);
  }
  if (byName.length === 1) return byName[0]!.slug;
  if (byName.length > 1) {
    throw new Error(`Ambiguous existing people for ${displayNameJa}: ${byName.map((candidate) => candidate.slug).join(", ")}`);
  }

  if (displayNameRoman) {
    const romanCandidates = lookup.byRoman.get(normalizeRomanLookup(displayNameRoman)) ?? [];
    const romanByOrg = romanCandidates.filter((candidate) => candidate.organizationSlugs.has(organizationSlug));
    if (romanByOrg.length === 1) return romanByOrg[0]!.slug;
    if (romanCandidates.length === 1) return romanCandidates[0]!.slug;
  }

  return `person-nittaidai326-${createHash("sha1").update(`${organizationSlug}|${displayNameJa}`).digest("hex").slice(0, 20)}`;
}

function splitProgramColumns(line: string, heatLine: string, heats: string[]) {
  if (heats.length < 2) return [line];
  if (heatLine.includes("タイムレース上位8位")) return [line];
  const splitIndex = heatLine.indexOf(`${heats[1]}組`);
  return [line.slice(0, splitIndex), line.slice(splitIndex)];
}

function parseProgramEntriesByHeat(text: string) {
  const pages = text.split("\f");
  const result = new Map<string, ProgramEntry>();

  for (const page of pages) {
    const lines = page.split(/\r?\n/u);
    const eventHeader = lines.map((line) => line.trim()).find((line) => EVENT_HEADER_TO_DISCIPLINE.has(line));
    if (!eventHeader) continue;

    const heatLineIndex = lines.findIndex(
      (line) => /組/u.test(line) && /\d組/u.test(line) && !line.trim().startsWith("ﾀｲﾑﾚｰｽ"),
    );
    if (heatLineIndex === -1) continue;

    const heatLine = lines[heatLineIndex]!;
    const heats = [...heatLine.matchAll(/(\d)組/gu)].map((match) => match[1]!);

    for (const line of lines.slice(heatLineIndex + 1)) {
      for (const [index, column] of splitProgramColumns(line, heatLine, heats).entries()) {
        const heat = heats[index];
        if (!heat) continue;
        const headMatch = column.match(/^\s*\d+\s+(\d{3,5})\s+(.+?)\s*$/u);
        if (!headMatch) continue;
        const bib = headMatch[1]!;
        const remainder = headMatch[2]!;
        const parts = remainder
          .split(/\s{2,}/u)
          .map((part) => part.trim())
          .filter(Boolean);
        if (parts.length < 2) continue;
        const normalizedParts = [...parts];
        if (normalizedParts.length >= 3 && /^\d+$/u.test(normalizedParts.at(-1)!)) {
          normalizedParts.pop();
        }
        let organizationLabel = normalizeOrganizationFromSource(normalizedParts.at(-1)!.replace(/\s+\d+$/u, "").trim());
        let rawName = parts
          .slice(0, normalizedParts.length - 1)
          .join(" ")
          .replace(/\((?:[^)]*)\)\s*$/u, "")
          .replace(/\((?:[^)]*)\)\s*$/u, "")
          .trim();
        if (organizationLabel.includes("(") || /[0-9][)）]/u.test(organizationLabel)) {
          const fallbackMatch = remainder.match(/^(.+?(?:\([^)]*\)){1,2})\s+(.+)$/u);
          if (fallbackMatch) {
            rawName = fallbackMatch[1]!
              .replace(/\((?:[^)]*)\)\s*$/u, "")
              .replace(/\((?:[^)]*)\)\s*$/u, "")
              .trim();
            organizationLabel = normalizeOrganizationFromSource(fallbackMatch[2]!.replace(/\s+\d+$/u, "").trim());
          }
        }
        const displayNameJa = normalizePersonDisplayNameJa(rawName);
        result.set(`${eventHeader}::${heat}::${bib}`, { displayNameJa, organizationLabel });
      }
    }
  }

  return result;
}

function splitResultColumns(lines: string[], heatLineIndex: number, heatLine: string, heats: string[], line: string) {
  if (heats.length < 2) return [line];

  const headerSplitLine = lines
    .slice(heatLineIndex + 1, heatLineIndex + 4)
    .find((candidate) => [...candidate.matchAll(/Place/gu)].length >= 2);
  if (headerSplitLine) {
    const firstPlace = headerSplitLine.indexOf("Place");
    const secondPlace = headerSplitLine.indexOf("Place", firstPlace + "Place".length);
    if (secondPlace > 0) return [line.slice(0, secondPlace), line.slice(secondPlace)];
  }

  if (heatLine.includes("Summary Top8")) return [line];

  const splitIndex = heatLine.indexOf(`Heat${heats[1]}`);
  return [line.slice(0, splitIndex), line.slice(splitIndex)];
}

function parseResultRowsByHeat(text: string) {
  const pages = text.split("\f");
  const result = new Map<string, ParsedResultRow[]>();

  for (const page of pages) {
    const lines = page.split(/\r?\n/u);
    const englishHeader = lines
      .map((line) => line.trim())
      .find((line) => line === "800Metres Men" || line === "1500Metres Men" || line === "3000Metres Men");
    if (!englishHeader) continue;

    const eventHeader =
      englishHeader === "800Metres Men" ? "男子800m" : englishHeader === "1500Metres Men" ? "男子1500m" : "男子3000m";
    const heatLineIndex = lines.findIndex((line) => /^Heat\d/u.test(line.trim()));
    if (heatLineIndex === -1) continue;
    const heatLine = lines[heatLineIndex]!;
    const heats = [...heatLine.matchAll(/Heat(\d+)/gu)].map((match) => match[1]!);

    for (const line of lines.slice(heatLineIndex + 1)) {
      if (line.includes("凡例")) break;
      if (heatLine.includes("Summary Top8")) {
        const startMatch = line.match(/^\s*(?:(\d+)\s+)?(?:(\d+)\s+)?(\d{3,5})\b/u);
        const markMatch = line.match(/(DNS|DNF|DQ(?:,[A-Z0-9]+)?|\d+:\d{2}\.\d{2}|\d{1,2}\.\d{2})(?:\s+\d+)?\s*$/u);
        if (!startMatch || !markMatch) continue;
        const bib = startMatch[3]!;
        const rank = startMatch[1] ? Number(startMatch[1]) : null;
        const mark = markMatch[1]!;
        const key = `${eventHeader}::${heats[0]!}`;
        const entry: ParsedResultRow = {
          bib,
          rank,
          mark,
          notes: normalizeNotes(mark),
        };
        result.set(key, [...(result.get(key) ?? []), entry]);
        continue;
      }
      for (const [index, column] of splitResultColumns(lines, heatLineIndex, heatLine, heats, line).entries()) {
        const heat = heats[index];
        if (!heat) continue;
        const startMatch = column.match(/^\s*(?:(\d+)\s+)?(?:(\d+)\s+)?(\d{3,5})\b/u);
        const markMatch = column.match(/(DNS|DNF|DQ(?:,[A-Z0-9]+)?|\d+:\d{2}\.\d{2}|\d{1,2}\.\d{2})\s*$/u);
        if (!startMatch || !markMatch) continue;

        const bib = startMatch[3]!;
        const rank = startMatch[1] ? Number(startMatch[1]) : null;
        const mark = markMatch[1]!;
        const entry: ParsedResultRow = {
          bib,
          rank,
          mark,
          notes: normalizeNotes(mark),
        };
        const key = `${eventHeader}::${heat}`;
        result.set(key, [...(result.get(key) ?? []), entry]);
      }
    }
  }

  for (const [key, entry] of MANUAL_RESULT_OVERRIDES.entries()) {
    if (SKIPPED_ROWS.has(key)) continue;
    const [eventHeader, heat] = key.split("::");
    const heatKey = `${eventHeader}::${heat}`;
    const rows = result.get(heatKey) ?? [];
    if (rows.some((row) => row.bib === entry.bib)) continue;
    result.set(heatKey, [...rows, entry]);
  }

  for (const [key, rows] of result) {
    result.set(
      key,
      rows.sort((left, right) => {
        if (left.rank !== null && right.rank !== null) return left.rank - right.rank;
        if (left.rank !== null) return -1;
        if (right.rank !== null) return 1;
        return Number(left.bib) - Number(right.bib);
      }),
    );
  }

  return result;
}

function resolveProgramEntry(
  definition: RaceDefinition,
  row: ParsedResultRow,
  programEntries: Map<string, ProgramEntry>,
) {
  const rowKey = `${definition.eventHeader}::${definition.heat}::${row.bib}::${row.rank ?? ""}::${row.mark}`;
  return MANUAL_PROGRAM_ENTRY_OVERRIDES.get(rowKey) ?? programEntries.get(`${definition.eventHeader}::${definition.heat}::${row.bib}`);
}

function buildSourceEntityKey(definition: RaceDefinition, row: ParsedResultRow, rows: ParsedResultRow[]) {
  const duplicateBibCount = rows.filter((candidate) => candidate.bib === row.bib).length;
  if (duplicateBibCount <= 1) return `${definition.sourceEntityPrefix}-${row.bib}`;
  const suffix = row.rank !== null ? `r${row.rank}` : row.mark.replace(/[^0-9A-Za-z]+/g, "").toLowerCase();
  return `${definition.sourceEntityPrefix}-${row.bib}-${suffix}`;
}

async function buildPayload(
  definition: RaceDefinition,
  programEntries: Map<string, ProgramEntry>,
  resultRowsByHeat: Map<string, ParsedResultRow[]>,
  organizationLookup: Awaited<ReturnType<typeof loadOrganizationLookup>>,
  personLookup: Awaited<ReturnType<typeof loadPersonLookup>>,
) {
  const heatKey = `${definition.eventHeader}::${definition.heat}`;
  const rows = resultRowsByHeat.get(heatKey);
  if (!rows || rows.length === 0) throw new Error(`Missing parsed rows for ${heatKey}`);

  const entries: RaceImportPayload["entries"] = [];
  for (const row of rows) {
    const scopedKey = `${definition.eventHeader}::${definition.heat}::${row.bib}`;
    if (SKIPPED_ROWS.has(scopedKey)) continue;
    const programEntry = resolveProgramEntry(definition, row, programEntries);
    if (!programEntry) throw new Error(`Missing program entry for ${scopedKey}`);
    const organization = resolveOrganization(programEntry.organizationLabel, organizationLookup);
    const slug = resolvePersonSlug(programEntry.displayNameJa, null, organization.slug, personLookup);

    entries.push({
      slug,
      displayNameJa: programEntry.displayNameJa,
      displayNameKana: null,
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
      sourceEntityKey: buildSourceEntityKey(definition, row, rows),
      sourceUrl: definition.sourceUrl,
    });
  }

  return raceImportPayloadSchema.parse({
    batchKey: `${definition.raceSlug}-${BATCH_DATE}`,
    sourceId: SOURCE_ID,
    raceSlug: definition.raceSlug,
    summary: `第152回日本体育大学陸上競技会兼第326回日本体育大学長距離競技会 ${definition.displayName} 公式PDF import`,
    pbNotes: "日本体育大学公式PDF。PB/SB表記はソースにないため反映していない。DNS/DNF/DQなどの公式注記はnotesに保持した。男子1500m5組の上岡煌（3537）は公式結果PDFで記録欄が空欄のため未導入。",
    entries,
  });
}

async function main() {
  await ensureSourceFiles();
  await mkdir(OUT_DIR, { recursive: true });

  const [programText, resultText] = await Promise.all([readFile(PROGRAM_TEXT_PATH, "utf8"), readFile(RESULT_TEXT_PATH, "utf8")]);
  const programEntries = parseProgramEntriesByHeat(programText);
  const resultRowsByHeat = parseResultRowsByHeat(resultText);
  const organizationLabels = [...new Set([...programEntries.values()].map((entry) => entry.organizationLabel))];
  const personNames = [...new Set([...programEntries.values()].map((entry) => entry.displayNameJa))];

  const organizationLookup = await loadOrganizationLookup(organizationLabels);
  const personLookup = await loadPersonLookup(personNames);

  for (const definition of RACE_DEFINITIONS) {
    const payload = await buildPayload(definition, programEntries, resultRowsByHeat, organizationLookup, personLookup);
    const outPath = path.join(OUT_DIR, `${definition.raceSlug}.json`);
    await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`${definition.raceSlug}: ${payload.entries.length}`);
  }

  const partGroups = [
    RACE_DEFINITIONS.slice(0, 4),
    RACE_DEFINITIONS.slice(4, 8),
    RACE_DEFINITIONS.slice(8, 11),
  ];
  for (const [index, definitions] of partGroups.entries()) {
    const payloads = await Promise.all(
      definitions.map(async (definition) => buildPayload(definition, programEntries, resultRowsByHeat, organizationLookup, personLookup)),
    );
    const outPath = path.join(OUT_DIR, `nittaidai-long-distance-meet-326-men-part-${index + 1}.json`);
    await writeFile(outPath, `${JSON.stringify(payloads, null, 2)}\n`, "utf8");
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
