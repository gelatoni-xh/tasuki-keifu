import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { OrganizationType } from "@prisma/client";

import { raceImportPayloadSchema, type RaceImportPayload } from "../lib/import-types";
import { normalizeDisplayNameJa } from "../lib/name-normalization";
import {
  buildNewYearEkidenBatchKey,
  buildNewYearEkidenPayloadPath,
  buildNewYearEkidenPdfPath,
  buildNewYearEkidenRaceSlug,
  buildNewYearEkidenSourceId,
  buildNewYearEkidenSourceUrl,
  compactJa,
  mergeNotes,
  normalizeJa,
  normalizeOrganizationLabel,
  slugifyJapaneseFallback,
} from "../lib/new-year-ekiden";
import { prisma } from "../lib/prisma";

const execFileAsync = promisify(execFile);

type PersonLookupEntry = {
  slug: string;
  displayNameJa: string;
  organizationSlugs: Set<string>;
};

type TeamSummary = {
  teamNumber: number;
  teamName: string;
  organizationSlug: string;
  organizationNameJa: string;
  organizationType: "corporate_team";
  finalRank: number | null;
  finalMark: string;
  notes: string | null;
  isOpen: boolean;
};

type PassingSnapshot = {
  teamNumber: number;
  cumulativeRank: number | null;
  cumulativeMark: string;
  gapFromLeader: string | null;
};

type LegResult = {
  teamNumber: number;
  rank: number;
  displayNameJa: string;
  teamName: string;
  mark: string;
  notes: string | null;
};

function buildOrganizationAliasCandidates(nameJa: string, shortName: string | null) {
  const aliases = new Set<string>();
  aliases.add(normalizeOrganizationLabel(nameJa));

  if (shortName) {
    aliases.add(normalizeOrganizationLabel(shortName));
  }

  return aliases;
}

async function ensurePdf(edition: number) {
  const pdfPath = buildNewYearEkidenPdfPath(edition);

  try {
    await readFile(pdfPath);
    return pdfPath;
  } catch {
    await mkdir(path.dirname(pdfPath), { recursive: true });
    await execFileAsync("curl", ["-L", "--fail", "-o", pdfPath, buildNewYearEkidenSourceUrl(edition)], {
      maxBuffer: 20 * 1024 * 1024,
    });
    return pdfPath;
  }
}

async function extractPageText(pdfPath: string, page: number) {
  const { stdout } = await execFileAsync(
    "pdftotext",
    ["-f", String(page), "-l", String(page), "-layout", pdfPath, "-"],
    { maxBuffer: 20 * 1024 * 1024 },
  );

  return stdout.replace(/\r/g, "");
}

function parseOverallSummary(pageText: string, organizationLookup: Map<string, {
  slug: string;
  nameJa: string;
}>) {
  const lines = pageText.split("\n");
  const summaries = new Map<number, TeamSummary>();

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\d+|--)\s+(\d+)\s+(\S+)\s+([0-9:]+)\s+/);
    if (!match) {
      continue;
    }

    const [, rankToken, teamNumberToken, sourceTeamName, finalMark] = match;
    const normalizedSourceName = normalizeOrganizationLabel(sourceTeamName);
    const resolvedOrganization = organizationLookup.get(normalizedSourceName);

    summaries.set(Number(teamNumberToken), {
      teamNumber: Number(teamNumberToken),
      teamName: sourceTeamName,
      organizationSlug: resolvedOrganization?.slug ?? slugifyJapaneseFallback("org", sourceTeamName),
      organizationNameJa: resolvedOrganization?.nameJa ?? sourceTeamName,
      organizationType: "corporate_team",
      finalRank: rankToken === "--" ? null : Number(rankToken),
      finalMark,
      notes: rankToken === "--" ? "OP" : null,
      isOpen: rankToken === "--",
    });
  }

  if (summaries.size === 0) {
    throw new Error("Failed to parse any team summary rows from New Year Ekiden PDF");
  }

  return summaries;
}

function parseLeftTableRow(text: string) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) {
    return null;
  }

  const rankToken = tokens[0];
  const teamNumberToken = tokens[1];
  const teamName = tokens[2];
  const cumulativeMark = tokens[3] ?? null;

  if (!/^(--|\d+)$/.test(rankToken ?? "") || !/^\d+$/.test(teamNumberToken ?? "") || !cumulativeMark) {
    return null;
  }

  const rawGapFromLeader = tokens.length >= 5 ? tokens[4] ?? null : null;
  const gapFromLeader = rawGapFromLeader === cumulativeMark ? null : rawGapFromLeader;

  return {
    teamNumber: Number(teamNumberToken),
    teamName: teamName.trim(),
    cumulativeRank: rankToken === "--" ? null : Number(rankToken),
    cumulativeMark,
    gapFromLeader,
  } satisfies PassingSnapshot;
}

function parseRightTableRow(text: string) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 5) {
    return null;
  }

  const rankToken = tokens[0];
  const teamNumberToken = tokens[1];
  if (!/^\d+$/.test(rankToken ?? "") || !/^\d+$/.test(teamNumberToken ?? "")) {
    return null;
  }

  let note: string | null = null;
  let markIndex = tokens.length - 1;
  if (!/^[0-9:]+$/.test(tokens[markIndex] ?? "")) {
    note = normalizeJa(tokens[markIndex] ?? "");
    markIndex -= 1;
  }

  const mark = tokens[markIndex] ?? "";
  const teamIndex = markIndex - 1;
  if (teamIndex < 3 || !/^[0-9:]+$/.test(mark)) {
    return null;
  }

  const teamName = tokens[teamIndex] ?? "";
  const displayNameJa = normalizeDisplayNameJa(tokens.slice(2, teamIndex).join(" "));

  return {
    rank: Number(rankToken),
    teamNumber: Number(teamNumberToken),
    displayNameJa,
    teamName: teamName.trim(),
    mark,
    notes: note,
  } satisfies LegResult;
}

function parseDetailedLegPage(pageText: string) {
  const lines = pageText.split("\n");
  const headerLine = lines.find((line) => line.includes("チーム名") && line.includes("選手名"));
  if (!headerLine) {
    throw new Error("Failed to find split header on detailed leg page");
  }

  const rightTableIndex = headerLine.indexOf("順", 10);
  if (rightTableIndex === -1) {
    throw new Error("Failed to find right-table offset on detailed leg page");
  }

  const passing = new Map<number, PassingSnapshot>();
  const legResults = new Map<number, LegResult>();

  for (const line of lines) {
    if (!/^\s*(?:--|\d+)\s+\d+/.test(line)) {
      continue;
    }

    const leftPart = line.slice(0, rightTableIndex).trimEnd();
    const rightPart = line.slice(rightTableIndex).trimEnd();

    const leftRow = parseLeftTableRow(leftPart);
    const rightRow = parseRightTableRow(rightPart);

    if (leftRow) {
      passing.set(leftRow.teamNumber, leftRow);
    }

    if (rightRow) {
      legResults.set(rightRow.teamNumber, rightRow);
    }
  }

  if (passing.size === 0 || legResults.size === 0) {
    throw new Error("Failed to parse detailed leg page rows from New Year Ekiden PDF");
  }

  return { passing, legResults };
}

async function loadOrganizationLookup() {
  const organizations = await prisma.organization.findMany({
    where: {
      type: {
        in: [OrganizationType.corporate_team, OrganizationType.company],
      },
    },
    select: {
      slug: true,
      nameJa: true,
      shortName: true,
    },
  });

  const lookup = new Map<string, { slug: string; nameJa: string }>();
  for (const organization of organizations) {
    for (const alias of buildOrganizationAliasCandidates(organization.nameJa, organization.shortName)) {
      if (!lookup.has(alias)) {
        lookup.set(alias, {
          slug: organization.slug,
          nameJa: organization.nameJa,
        });
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

  const byName = new Map<string, PersonLookupEntry[]>();
  for (const person of people) {
    const entry: PersonLookupEntry = {
      slug: person.slug,
      displayNameJa: person.displayNameJa,
      organizationSlugs: new Set(
        [
          ...person.memberships.map((membership) => membership.organization.slug),
          ...person.raceResults.map((result) => result.organization?.slug).filter((slug): slug is string => Boolean(slug)),
        ],
      ),
    };

    const normalizedName = normalizeDisplayNameJa(person.displayNameJa);
    const group = byName.get(normalizedName) ?? [];
    group.push(entry);
    byName.set(normalizedName, group);
  }

  return byName;
}

function resolvePersonSlug(personLookup: Map<string, PersonLookupEntry[]>, displayNameJa: string, organizationSlug: string) {
  const normalizedName = normalizeDisplayNameJa(displayNameJa);
  const candidates = personLookup.get(normalizedName) ?? [];

  if (candidates.length === 0) {
    return slugifyJapaneseFallback("person", `${organizationSlug}-${displayNameJa}`);
  }

  const matchingOrganization = candidates.filter((candidate) => candidate.organizationSlugs.has(organizationSlug));
  if (matchingOrganization.length === 1) {
    return matchingOrganization[0]!.slug;
  }

  if (matchingOrganization.length > 1) {
    throw new Error(`Ambiguous existing people for ${displayNameJa} @ ${organizationSlug}: ${matchingOrganization.map((candidate) => candidate.slug).join(", ")}`);
  }

  if (candidates.length === 1) {
    return candidates[0]!.slug;
  }

  throw new Error(`Ambiguous existing people for ${displayNameJa}: ${candidates.map((candidate) => candidate.slug).join(", ")}`);
}

async function main() {
  const edition = Number(process.argv[2] ?? "69");

  if (edition !== 69) {
    throw new Error("Only edition 69 is supported for now");
  }

  const pdfPath = await ensurePdf(edition);
  const organizationLookup = await loadOrganizationLookup();
  const personLookup = await loadPersonLookup();

  const page2 = await extractPageText(pdfPath, 2);
  const summaryByTeam = parseOverallSummary(page2, organizationLookup);
  const sourceId = buildNewYearEkidenSourceId(edition);
  const sourceUrl = buildNewYearEkidenSourceUrl(edition);

  for (let leg = 1; leg <= 7; leg += 1) {
    const pageText = await extractPageText(pdfPath, leg + 2);
    const { passing, legResults } = parseDetailedLegPage(pageText);

    const entries: RaceImportPayload["entries"] = [];
    const teamResults: RaceImportPayload["teamResults"] = [];

    for (const [teamNumber, summary] of [...summaryByTeam.entries()].sort((left, right) => left[0] - right[0])) {
      const snapshot = passing.get(teamNumber);
      const legResult = legResults.get(teamNumber);

      if (!snapshot || !legResult) {
        throw new Error(`Missing detailed row for team ${teamNumber} on leg ${leg}`);
      }

      if (normalizeOrganizationLabel(snapshot.teamName) !== normalizeOrganizationLabel(summary.teamName)) {
        throw new Error(`Snapshot team mismatch on leg ${leg} for team ${teamNumber}: ${snapshot.teamName} / ${summary.teamName}`);
      }

      if (normalizeOrganizationLabel(legResult.teamName) !== normalizeOrganizationLabel(summary.teamName)) {
        throw new Error(`Leg result team mismatch on leg ${leg} for team ${teamNumber}: ${legResult.teamName} / ${summary.teamName}`);
      }

      const entryNotes = summary.isOpen
        ? mergeNotes(legResult.notes, ["OP"])
        : legResult.notes;
      const raceRank = summary.isOpen ? null : legResult.rank;
      const teamRank = summary.isOpen ? null : snapshot.cumulativeRank;
      const personSlug = resolvePersonSlug(personLookup, legResult.displayNameJa, summary.organizationSlug);

      entries.push({
        slug: personSlug,
        displayNameJa: legResult.displayNameJa,
        raceOrganizationSlug: summary.organizationSlug,
        raceOrganizationNameJa: summary.organizationNameJa,
        raceOrganizationType: summary.organizationType,
        grade: null,
        mark: legResult.mark,
        rank: raceRank,
        teamRank,
        notes: entryNotes,
        pbs: [],
        sourceEntityKey: `${edition}-leg-${leg}-team-${teamNumber}-${compactJa(legResult.displayNameJa)}`,
        sourceUrl,
      });

      teamResults.push({
        organizationSlug: summary.organizationSlug,
        organizationNameJa: summary.organizationNameJa,
        organizationType: summary.organizationType,
        finalRank: summary.finalRank,
        finalMark: summary.finalMark,
        notes: summary.notes,
        snapshot: {
          leg,
          cumulativeRank: summary.isOpen ? null : snapshot.cumulativeRank,
          cumulativeMark: snapshot.cumulativeMark,
          gapFromLeader: snapshot.gapFromLeader,
          notes: summary.isOpen ? "OP" : null,
        },
      });
    }

    const payload = raceImportPayloadSchema.parse({
      batchKey: buildNewYearEkidenBatchKey(edition, leg, "official-pdf"),
      sourceId,
      raceSlug: buildNewYearEkidenRaceSlug(edition, leg),
      summary: `第${edition}回ニューイヤー駅伝 ${leg}区 公式成績PDF import`,
      pbNotes: `第${edition}回ニューイヤー駅伝公式成績PDFには PB 情報がないため、PB 更新は行っていない。`,
      entries,
      teamResults,
    }) as RaceImportPayload;

    const outputPath = buildNewYearEkidenPayloadPath(edition, leg);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
