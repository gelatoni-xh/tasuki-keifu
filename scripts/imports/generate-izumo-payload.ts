import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { EventDiscipline, OrganizationType } from "@prisma/client";

import { raceImportPayloadSchema } from "../lib/import-types";
import {
  buildIzumoBatchKey,
  buildIzumoCachePath,
  buildIzumoPayloadPath,
  buildIzumoRaceSlug,
  buildIzumoRecordUrl,
  buildIzumoRunnerIndexUrl,
  buildIzumoRunnerOrderUrl,
  buildIzumoRunnerSourceId,
  buildIzumoSourceId,
  formatJapaneseTimeToMark,
  formatPbMark,
  normalizeJa,
  normalizeSchoolLabel,
} from "../lib/izumo";
import { normalizeDisplayNameJa } from "../lib/name-normalization";
import { prisma } from "../lib/prisma";

const execFileAsync = promisify(execFile);

type TeamDirectoryEntry = {
  teamNumber: number;
  teamName: string;
  teamUrl: string;
};

type RunnerProfile = {
  assignment: string | null;
  displayNameJa: string;
  displayNameKana: string | null;
  displayNameRoman: string | null;
  grade: number | null;
  highSchoolNameJa: string | null;
  memberUniversityNameJa: string | null;
  pb10000: string | null;
  pb5000: string | null;
  sourceUrl: string;
};

type LegRecordRow = {
  rank: number | null;
  teamNumber: number;
  displayNameJa: string;
  displayNameKana: string | null;
  teamName: string;
  mark: string;
  notes: string | null;
};

type LegPassingRow = {
  cumulativeRank: number | null;
  teamNumber: number;
  teamName: string;
  displayNameJa: string;
  displayNameKana: string | null;
  cumulativeMark: string;
  gapFromLeader: string | null;
  notes: string | null;
};

const personSlugCache = new Map<string, string>();
const organizationSlugCache = new Map<string, string>();
const personDirectory = new Map<string, {
  slug: string;
  displayNameJa: string;
  displayNameKana: string | null;
  displayNameRoman: string | null;
  universitySlugs: Set<string>;
  highSchoolSlugs: Set<string>;
}>();

const knownIzumoForeignAthleteOverrides = [
  {
    match: {
      displayNameKana: "ヴィクター キムタイ",
      universitySlug: "josai-university",
      highSchoolSlug: "mau-high-school",
    },
    slug: "victor-kimutai",
    displayNameJa: "ヴィクター キムタイ",
    displayNameKana: "ヴィクター キムタイ",
    displayNameRoman: "Victor Kimutai",
  },
] as const;

const knownIzumoOrganizationAliases: Partial<Record<OrganizationType, Record<string, string>>> = {
  high_school: {
    マウ: "mau-high-school",
    マウ高: "mau-high-school",
  },
};

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#xff5e;/g, "～")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
}

function normalizeText(value: string) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function stripHtmlComments(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, "");
}

function parseRunnerNameCell(cellHtml: string) {
  const nameMatch = cellHtml.match(/<span class="r_name">([\s\S]*?)<\/span>/i);
  const kanaMatch = cellHtml.match(/<span class="r_kana">([\s\S]*?)<\/span>/i);

  const rawName = normalizeText(nameMatch?.[1] ?? stripHtml(cellHtml)).replace(/^◎/, "");
  const rawKana = kanaMatch ? normalizeJa(stripHtml(kanaMatch[1])) : null;

  return {
    displayNameJa: normalizeDisplayNameJa(rawName),
    displayNameKana: rawKana || null,
  };
}

function hasLatinLetters(value: string | null | undefined) {
  return Boolean(value && /[A-Za-z]/.test(value));
}

function normalizeRomanText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}

function buildPersonLookupKeys(input: {
  displayNameJa: string;
  displayNameKana: string | null;
  displayNameRoman: string | null;
}) {
  const keys = new Set<string>();

  if (input.displayNameJa) {
    keys.add(`ja:${input.displayNameJa}`);
  }
  if (input.displayNameKana) {
    keys.add(`kana:${input.displayNameKana}`);
    keys.add(`ja:${input.displayNameKana}`);
  }

  const normalizedRoman = normalizeRomanText(input.displayNameRoman ?? (hasLatinLetters(input.displayNameJa) ? input.displayNameJa : null));
  if (normalizedRoman) {
    keys.add(`roman:${normalizedRoman}`);
  }

  return [...keys];
}

function registerPersonDirectoryEntry(input: {
  slug: string;
  displayNameJa: string;
  displayNameKana: string | null;
  displayNameRoman: string | null;
  universitySlugs?: Iterable<string>;
  highSchoolSlugs?: Iterable<string>;
}) {
  personDirectory.set(input.slug, {
    slug: input.slug,
    displayNameJa: input.displayNameJa,
    displayNameKana: input.displayNameKana,
    displayNameRoman: input.displayNameRoman,
    universitySlugs: new Set(input.universitySlugs ?? []),
    highSchoolSlugs: new Set(input.highSchoolSlugs ?? []),
  });

  for (const key of buildPersonLookupKeys(input)) {
    if (!personSlugCache.has(key)) {
      personSlugCache.set(key, input.slug);
    }
  }
}

function slugifyAscii(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function slugifyJapaneseFallback(prefix: string, value: string) {
  const ascii = slugifyAscii(value);
  if (ascii) {
    return `${prefix}-${ascii}`;
  }

  const hex = Buffer.from(value.normalize("NFKC")).toString("hex").slice(0, 24);
  return `${prefix}-${hex}`;
}

async function fetchWithCurl(url: string) {
  const { stdout } = await execFileAsync("curl", ["-L", "--fail", "--silent", "-A", "Mozilla/5.0", url], {
    maxBuffer: 20 * 1024 * 1024,
  });

  return stdout;
}

async function loadCachedHtml(cachePath: string, url: string) {
  try {
    return await readFile(cachePath, "utf8");
  } catch {
    const html = await fetchWithCurl(url);
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, html, "utf8");
    return html;
  }
}

function parseTeamDirectory(html: string, edition: number) {
  const tableMatch = html.match(/<table class="page__table runners">([\s\S]+?)<\/table>/i);
  if (!tableMatch) {
    throw new Error("Izumo runner directory table not found");
  }

  const rows = [...html.matchAll(/<tr>\s*<th>(\d+)<\/th>\s*<td><a href="([^"]+)">([^<]+)<\/a><\/td>\s*<\/tr>/gi)];
  return rows.map((match) => ({
    teamNumber: Number(match[1]),
    teamUrl: new URL(match[2], buildIzumoRunnerIndexUrl(edition)).toString(),
    teamName: normalizeText(match[3]),
  })) satisfies TeamDirectoryEntry[];
}

function repairIzumoRunnerHtml(html: string) {
  return html.replace(
    /(<\/tr>\s*)(<th>\s*[1-6区補員]+\s*<\/th>\s*<td><span class="r_name">[\s\S]*?<\/tr>)/g,
    (_, closingRow, brokenRow) => `${closingRow}<tr>${brokenRow}`,
  );
}

function parseRunnerProfiles(html: string, sourceUrl: string) {
  const repairedHtml = repairIzumoRunnerHtml(html);
  const hasGradeColumn = /<th rowspan="2">学年<\/th>/i.test(html);
  const hasHighSchoolColumn = /出身高校（都道府県）/i.test(html);
  const hasMemberUniversityColumn = /(?:大学名[\s\S]*選抜チームのみ|所属大学)/i.test(html);
  const rowMatches = [...repairedHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  const profiles: RunnerProfile[] = [];

  for (const rowMatch of rowMatches) {
    const rawCells = [...rowMatch[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => cell[1] ?? "");
    const cells = rawCells.map((cell) => stripHtml(cell));
    if (rawCells.length < 5) {
      continue;
    }

    const assignment = normalizeText(cells[0] ?? "") || null;
    const { displayNameJa, displayNameKana } = parseRunnerNameCell(rawCells[1] ?? "");
    const grade = hasGradeColumn ? Number(normalizeText(cells[2] ?? "")) : null;
    const highSchoolIndex = hasGradeColumn ? 3 : 2;
    const memberUniversityIndex = highSchoolIndex + (hasHighSchoolColumn ? 1 : 0);
    const pb10000Index = memberUniversityIndex + (hasMemberUniversityColumn ? 1 : 0);
    const pb5000Index = pb10000Index + 1;

    const highSchoolNameJa = hasHighSchoolColumn
      ? normalizeText((cells[highSchoolIndex] ?? "").split("（")[0] ?? "") || null
      : null;
    const memberUniversityNameJa = hasMemberUniversityColumn
      ? normalizeText(cells[memberUniversityIndex] ?? "") || null
      : null;
    const pb10000 = formatPbMark(normalizeText(cells[pb10000Index] ?? ""));
    const pb5000 = formatPbMark(normalizeText(cells[pb5000Index] ?? ""));

    if (!displayNameJa) {
      continue;
    }

    profiles.push({
      assignment,
      displayNameJa,
      displayNameKana,
      displayNameRoman: hasLatinLetters(displayNameJa) ? displayNameJa : null,
      grade: Number.isFinite(grade) ? grade : null,
      highSchoolNameJa,
      memberUniversityNameJa,
      pb10000,
      pb5000,
      sourceUrl,
    });
  }

  return profiles;
}

function parseLegRecordRows(html: string) {
  const sanitizedHtml = stripHtmlComments(html);
  const bodyMatch = sanitizedHtml.match(/<table class="record__table recordsB">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)
    ?? sanitizedHtml.match(/<table class="record__table recordsB">([\s\S]*?)<\/table>/i);
  if (!bodyMatch) {
    throw new Error("Izumo leg record table not found");
  }

  const rows = [...bodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  return rows.map((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => normalizeText(cell[1] ?? ""));
    const notes = cells[6] ? normalizeText(cells[6]) : null;
    return {
      rank: Number(cells[0]) || null,
      teamNumber: Number(cells[1]),
      displayNameJa: normalizeDisplayNameJa(cells[2] ?? ""),
      displayNameKana: cells[3] ? normalizeJa(cells[3]) : null,
      teamName: normalizeText(cells[4] ?? ""),
      mark: formatJapaneseTimeToMark(cells[5] ?? "") ?? "",
      notes: notes || null,
    } satisfies LegRecordRow;
  }).filter((row) =>
    row.rank !== null &&
    row.teamNumber &&
    row.displayNameJa &&
    row.mark &&
    row.notes !== "参考記録" &&
    row.notes !== "DNF",
  );
}

function parsePassingRows(html: string) {
  const sanitizedHtml = stripHtmlComments(html);
  const bodyMatch = sanitizedHtml.match(/<table class="record__table recordsA">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)
    ?? sanitizedHtml.match(/<table class="record__table recordsA">([\s\S]*?)<\/table>/i);
  if (!bodyMatch) {
    throw new Error("Izumo passing table not found");
  }

  const rows = [...bodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  return rows.map((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => normalizeText(cell[1] ?? ""));
    const hasRunnerColumns = cells.length >= 8;
    const teamNameIndex = 2;
    const displayNameIndex = hasRunnerColumns ? 3 : -1;
    const displayNameKanaIndex = hasRunnerColumns ? 4 : -1;
    const cumulativeMarkIndex = hasRunnerColumns ? 5 : 3;
    const gapIndex = hasRunnerColumns ? 6 : 4;
    const notesIndex = hasRunnerColumns ? 7 : 5;
    const gap = formatJapaneseTimeToMark(cells[gapIndex] ?? "");
    const notes = cells[notesIndex] ? normalizeText(cells[notesIndex]) : null;
    return {
      cumulativeRank: Number(cells[0]) || null,
      teamNumber: Number(cells[1]),
      teamName: normalizeText(cells[teamNameIndex] ?? ""),
      displayNameJa: displayNameIndex >= 0 ? normalizeDisplayNameJa(cells[displayNameIndex] ?? "") : "",
      displayNameKana: displayNameKanaIndex >= 0 && cells[displayNameKanaIndex] ? normalizeJa(cells[displayNameKanaIndex]) : null,
      cumulativeMark: formatJapaneseTimeToMark(cells[cumulativeMarkIndex] ?? "") ?? "",
      gapFromLeader: gap && gap !== "0:00" ? gap : null,
      notes: notes || null,
    } satisfies LegPassingRow;
  }).filter((row) => row.cumulativeRank !== null && row.teamNumber && row.cumulativeMark);
}

async function resolvePersonSlug(input: {
  displayNameJa: string;
  displayNameKana: string | null;
  displayNameRoman: string | null;
  universitySlug: string | null;
  highSchoolSlug: string | null;
}) {
  const override = knownIzumoForeignAthleteOverrides.find((candidate) =>
    candidate.match.displayNameKana === input.displayNameKana &&
    candidate.match.universitySlug === input.universitySlug &&
    candidate.match.highSchoolSlug === input.highSchoolSlug,
  );
  if (override) {
    return override.slug;
  }

  for (const key of buildPersonLookupKeys(input)) {
    const slug = personSlugCache.get(key);
    if (slug) {
      return slug;
    }
  }

  const fallbackSearchToken = (() => {
    const kana = input.displayNameKana ?? input.displayNameJa;
    const parts = kana.split(" ").filter(Boolean);
    return parts.at(-1) ?? null;
  })();

  if (fallbackSearchToken && (input.universitySlug || input.highSchoolSlug)) {
    const candidates = [...personDirectory.values()].filter((person) => {
      const haystack = [person.displayNameJa, person.displayNameKana ?? "", person.displayNameRoman ?? ""].join(" ");
      if (!haystack.includes(fallbackSearchToken)) {
        return false;
      }

      const matchesUniversity = input.universitySlug
        ? person.universitySlugs.has(input.universitySlug)
        : false;
      const matchesHighSchool = input.highSchoolSlug
        ? person.highSchoolSlugs.has(input.highSchoolSlug)
        : false;

      return matchesUniversity || matchesHighSchool;
    });

    if (candidates.length === 1) {
      const candidate = candidates[0];
      for (const key of buildPersonLookupKeys(input)) {
        personSlugCache.set(key, candidate.slug);
      }
      return candidate.slug;
    }
  }

  const generated = slugifyJapaneseFallback("person", input.displayNameRoman ?? input.displayNameJa);
  registerPersonDirectoryEntry({
    slug: generated,
    displayNameJa: input.displayNameJa,
    displayNameKana: input.displayNameKana,
    displayNameRoman: input.displayNameRoman,
    universitySlugs: input.universitySlug ? [input.universitySlug] : [],
    highSchoolSlugs: input.highSchoolSlug ? [input.highSchoolSlug] : [],
  });
  return generated;
}

async function resolveOrganizationSlug(input: {
  nameJa: string;
  type: OrganizationType;
}) {
  const aliasedSlug = knownIzumoOrganizationAliases[input.type]?.[input.nameJa];
  if (aliasedSlug) {
    return aliasedSlug;
  }

  const cacheKey = `${input.type}::${input.nameJa}`;
  const cached = organizationSlugCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const existing = await prisma.organization.findFirst({
    where: {
      type: input.type,
      nameJa: input.nameJa,
    },
    select: {
      slug: true,
    },
  });

  if (existing) {
    organizationSlugCache.set(cacheKey, existing.slug);
    return existing.slug;
  }

  const all = await prisma.organization.findMany({
    where: {
      type: input.type,
    },
    select: {
      slug: true,
      nameJa: true,
    },
  });
  const normalizedTarget = normalizeSchoolLabel(input.nameJa);
  const byNormalizedName = all.find((organization) => normalizeSchoolLabel(organization.nameJa) === normalizedTarget);
  if (byNormalizedName) {
    organizationSlugCache.set(cacheKey, byNormalizedName.slug);
    return byNormalizedName.slug;
  }

  if (input.type === OrganizationType.high_school && !input.nameJa.endsWith("高校")) {
    const normalizedWithSuffix = normalizeSchoolLabel(`${input.nameJa}高校`);
    const bySuffixName = all.find((organization) => normalizeSchoolLabel(organization.nameJa) === normalizedWithSuffix);
    if (bySuffixName) {
      organizationSlugCache.set(cacheKey, bySuffixName.slug);
      return bySuffixName.slug;
    }
  }

  const generated = slugifyJapaneseFallback(input.type === OrganizationType.high_school ? "hs" : "org", input.nameJa);
  organizationSlugCache.set(cacheKey, generated);
  return generated;
}

async function warmCaches() {
  const [people, organizations] = await Promise.all([
    prisma.person.findMany({
      select: {
        slug: true,
        displayNameJa: true,
        displayNameKana: true,
        displayNameRoman: true,
        memberships: {
          select: {
            organization: {
              select: {
                slug: true,
                type: true,
              },
            },
          },
        },
        raceResults: {
          where: {
            organizationId: { not: null },
          },
          select: {
            organization: {
              select: {
                slug: true,
                type: true,
              },
            },
          },
        },
      },
    }),
    prisma.organization.findMany({
      select: {
        slug: true,
        nameJa: true,
        type: true,
      },
    }),
  ]);

  for (const person of people) {
    const universitySlugs = new Set<string>();
    const highSchoolSlugs = new Set<string>();

    for (const membership of person.memberships) {
      if (membership.organization.type === OrganizationType.university) {
        universitySlugs.add(membership.organization.slug);
      }
      if (membership.organization.type === OrganizationType.high_school) {
        highSchoolSlugs.add(membership.organization.slug);
      }
    }

    for (const raceResult of person.raceResults) {
      if (!raceResult.organization) {
        continue;
      }
      if (raceResult.organization.type === OrganizationType.university || raceResult.organization.type === OrganizationType.club) {
        universitySlugs.add(raceResult.organization.slug);
      }
    }

    registerPersonDirectoryEntry({
      slug: person.slug,
      displayNameJa: person.displayNameJa,
      displayNameKana: person.displayNameKana,
      displayNameRoman: person.displayNameRoman,
      universitySlugs,
      highSchoolSlugs,
    });
  }

  for (const organization of organizations) {
    organizationSlugCache.set(`${organization.type}::${organization.nameJa}`, organization.slug);
    organizationSlugCache.set(
      `${organization.type}::${normalizeSchoolLabel(organization.nameJa)}`,
      organization.slug,
    );
  }
}

async function loadTeamProfiles(edition: number) {
  const runnerIndexHtml = await loadCachedHtml(
    buildIzumoCachePath(edition, "runner-index"),
    buildIzumoRunnerIndexUrl(edition),
  );
  const teams = parseTeamDirectory(runnerIndexHtml, edition);
  const profilesByTeamNumber = new Map<number, RunnerProfile[]>();

  for (const team of teams) {
    const orderHtml = await loadCachedHtml(
      buildIzumoCachePath(edition, `runner-order-${String(team.teamNumber).padStart(2, "0")}`),
      buildIzumoRunnerOrderUrl(edition, team.teamNumber),
    );
    profilesByTeamNumber.set(team.teamNumber, parseRunnerProfiles(orderHtml, team.teamUrl));
  }

  return {
    teams,
    profilesByTeamNumber,
  };
}

async function main() {
  const edition = Number(process.argv[2] ?? "36");
  const leg = Number(process.argv[3] ?? "");

  if (!Number.isFinite(edition) || !Number.isFinite(leg) || leg < 1 || leg > 6) {
    throw new Error("Usage: tsx scripts/imports/generate-izumo-payload.ts <edition> <leg>");
  }

  const sourceId = buildIzumoSourceId(edition);
  const runnerSourceId = buildIzumoRunnerSourceId(edition);
  const raceSlug = buildIzumoRaceSlug(edition, leg);
  const batchKey = buildIzumoBatchKey(edition, leg, new Date().toISOString().slice(0, 10).replace(/-/g, ""));

  await warmCaches();

  const [legRecordHtml, passingHtml, teamProfiles] = await Promise.all([
    loadCachedHtml(buildIzumoCachePath(edition, `record-${leg}b`), buildIzumoRecordUrl(edition, leg, "b")),
    loadCachedHtml(buildIzumoCachePath(edition, `record-${leg}a`), buildIzumoRecordUrl(edition, leg, "a")),
    loadTeamProfiles(edition),
  ]);

  const legRecordRows = parseLegRecordRows(legRecordHtml);
  const passingRows = parsePassingRows(passingHtml);
  const passingByTeamNumber = new Map(passingRows.map((row) => [row.teamNumber, row]));
  const teamDirectoryByNumber = new Map(teamProfiles.teams.map((row) => [row.teamNumber, row]));

  const entries = [];
  const teamResults = [];

  for (const row of legRecordRows) {
    const profiles = teamProfiles.profilesByTeamNumber.get(row.teamNumber) ?? [];
    const assignmentLabel = `${leg}区`;
    const profile = profiles.find((candidate) => candidate.assignment === assignmentLabel)
      ?? profiles.find((candidate) => candidate.displayNameJa === row.displayNameJa);
    if (!profile) {
      throw new Error(`Missing runner profile for leg ${leg}: team ${row.teamName} / ${row.displayNameJa}`);
    }

    const teamInfo = teamDirectoryByNumber.get(row.teamNumber);
    const passing = passingByTeamNumber.get(row.teamNumber);
    const universityNameJa = teamInfo?.teamName ?? row.teamName;
    const universityType = universityNameJa.includes("選抜") ? "club" : "university";
    const universitySlug = await resolveOrganizationSlug({
      nameJa: universityNameJa,
      type: universityType === "club" ? OrganizationType.club : OrganizationType.university,
    });
    const highSchoolSlug = profile.highSchoolNameJa
      ? await resolveOrganizationSlug({
          nameJa: profile.highSchoolNameJa,
          type: OrganizationType.high_school,
        })
      : null;
    const normalizedDisplayNameJa =
      hasLatinLetters(profile.displayNameJa) && profile.displayNameKana
        ? profile.displayNameKana
        : profile.displayNameJa;
    const displayNameRoman = profile.displayNameRoman;
    const override = knownIzumoForeignAthleteOverrides.find((candidate) =>
      candidate.match.displayNameKana === normalizedDisplayNameJa &&
      candidate.match.universitySlug === (universityType === "university" ? universitySlug : null) &&
      candidate.match.highSchoolSlug === highSchoolSlug,
    );
    const personSlug = await resolvePersonSlug({
      displayNameJa: override?.displayNameJa ?? normalizedDisplayNameJa,
      displayNameKana: override?.displayNameKana ?? profile.displayNameKana,
      displayNameRoman: override?.displayNameRoman ?? displayNameRoman,
      universitySlug: universityType === "university" ? universitySlug : null,
      highSchoolSlug,
    });

    const pbs = [
      profile.pb10000 ? { discipline: EventDiscipline.m10000, mark: profile.pb10000 } : null,
      profile.pb5000 ? { discipline: EventDiscipline.m5000, mark: profile.pb5000 } : null,
    ].filter(Boolean);

    entries.push({
      slug: personSlug,
      displayNameJa: override?.displayNameJa ?? normalizedDisplayNameJa,
      displayNameKana: override?.displayNameKana ?? profile.displayNameKana,
      displayNameRoman: override?.displayNameRoman ?? displayNameRoman,
      raceOrganizationSlug: universitySlug,
      raceOrganizationNameJa: universityNameJa,
      raceOrganizationType: universityType,
      universitySlug: universityType === "university" ? universitySlug : null,
      universityNameJa: universityType === "university" ? universityNameJa : null,
      highSchoolSlug,
      highSchoolNameJa: profile.highSchoolNameJa,
      grade: profile.grade,
      mark: row.mark,
      rank: row.rank,
      teamRank: passing?.cumulativeRank ?? null,
      notes: row.notes,
      pbs,
      sourceEntityKey: `izumo-${edition}-team-${row.teamNumber}-leg-${leg}-${personSlug}`,
      sourceUrl: profile.sourceUrl,
    });

    if (!passing) {
      throw new Error(`Missing team summary for team ${row.teamName}`);
    }

    teamResults.push({
      organizationSlug: universitySlug,
      organizationNameJa: universityNameJa,
      organizationType: universityType,
      finalRank: leg === 6 ? passing.cumulativeRank : null,
      finalMark: leg === 6 ? passing.cumulativeMark : null,
      notes: null,
      snapshot: {
        leg,
        cumulativeRank: passing.cumulativeRank,
        cumulativeMark: passing.cumulativeMark,
        gapFromLeader: passing.gapFromLeader,
        notes: passing.notes,
      },
    });
  }

  const payload = raceImportPayloadSchema.parse({
    batchKey,
    sourceId,
    raceSlug,
    summary: `第${edition}回出雲駅伝 ${leg}区 官方結果導入`,
    pbNotes: `第${edition}回出雲駅伝 選手紹介ページの自己最高記録摘要。正式 PB の大会別確認は後続タスクで再確認。`,
    entries,
    teamResults,
  });

  const outputPath = buildIzumoPayloadPath(edition, leg);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Generated ${outputPath}`);
  console.log(`Runner source reference: ${runnerSourceId}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
