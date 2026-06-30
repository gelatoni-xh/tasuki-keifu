import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { DataStatus, OrganizationType, SourceType } from "@prisma/client";

import { markToMilliseconds } from "../lib/import-utils";
import { prisma } from "../lib/prisma";

const execFileAsync = promisify(execFile);

type HakoneOfficialTeamRow = {
  finalRank: number | null;
  teamName: string;
  finalMark: string | null;
  outwardRank: number | null;
  outwardMark: string | null;
  returnRank: number | null;
  returnMark: string | null;
};

type HakoneChitenEntry = {
  CHITEN_ID?: string;
  KUKAN?: string;
};

type HakoneSokuhouTeamEntry = {
  TEAM_NAME?: string;
  SOGOU_JUNI?: string | number;
  SOGO_TIME?: string | null;
  TIME_DIF_F1?: string | null;
  KOUSIKI_FLG?: string | number | null;
  KURIAGE_FLG?: string | number | null;
};

type HakoneSokuhouResponse = {
  RECORD?: {
    SOGOU?: HakoneSokuhouTeamEntry[];
  };
};

function normalizeJa(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[ 　]/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/[／/]/g, "・")
    .replace(/附属/g, "付属")
    .replace(/大學/g, "大学")
    .trim();
}

function normalizeTeamLabel(value: string) {
  return normalizeJa(value)
    .replace(/高等学校/g, "高校")
    .replace(/学校高等部/g, "高校");
}

function parseIntField(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "OP") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildHakoneOfficialSourceId(edition: number) {
  return `source-hakone-official-${edition}-team-results`;
}

function buildHakoneSokuhouSourceId(edition: number) {
  return `source-ntv-hakone-${edition}-sokuhou`;
}

function buildHakoneOfficialUrl(edition: number) {
  const tnByEdition: Record<number, number> = {
    97: 99,
    98: 101,
    99: 102,
    100: 103,
    101: 104,
    102: 106,
  };

  const tn = tnByEdition[edition];
  if (!tn) {
    throw new Error(`No official Hakone tn mapping configured for edition ${edition}`);
  }

  return `https://www.hakone-ekiden.jp/record/record02.php?tn=${tn}`;
}

function buildHakoneChitenUrl(edition: number) {
  return `https://www.ntv.co.jp/hakone/data_cms/json/chiten/${edition}/chiten.json`;
}

function buildHakoneSokuhouUrl(edition: number, chitenId: string) {
  return `https://www.ntv.co.jp/hakone/assets_data/${edition}/Sokuhou_${chitenId}.json`;
}

function buildHakoneOfficialPath(edition: number) {
  return path.resolve(`tmp/hakone-${edition}-official-team-results.html`);
}

function buildHakoneChitenPath(edition: number) {
  return path.resolve(`tmp/hakone-${edition}-chiten.json`);
}

function buildHakoneSokuhouPath(edition: number, chitenId: string) {
  return path.resolve(`tmp/hakone-${edition}-sokuhou-${chitenId}.json`);
}

async function fetchWithCurl(url: string, extraArgs: string[] = []) {
  const { stdout } = await execFileAsync("curl", ["-L", "--fail", "--silent", ...extraArgs, url], {
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout;
}

async function loadCachedFile(cachePath: string, loader: () => Promise<string>) {
  try {
    return await readFile(cachePath, "utf8");
  } catch {
    const content = await loader();
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, content, "utf8");
    return content;
  }
}

async function loadOfficialHtml(edition: number) {
  return loadCachedFile(buildHakoneOfficialPath(edition), () =>
    fetchWithCurl(buildHakoneOfficialUrl(edition), ["-A", "Mozilla/5.0"]),
  );
}

async function loadChitenJson(edition: number) {
  return loadCachedFile(buildHakoneChitenPath(edition), () =>
    fetchWithCurl(buildHakoneChitenUrl(edition), ["--http1.1", "-A", "Mozilla/5.0"]),
  );
}

async function loadSokuhouJson(edition: number, chitenId: string) {
  return loadCachedFile(buildHakoneSokuhouPath(edition, chitenId), () =>
    fetchWithCurl(buildHakoneSokuhouUrl(edition, chitenId)),
  );
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
}

function parseOfficialTeamRows(html: string) {
  const tableMatch = html.match(/<table class="record layout02">([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    throw new Error("Official Hakone team-results table not found");
  }

  const rows = [...tableMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const results: HakoneOfficialTeamRow[] = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripHtml(match[1] ?? ""));
    if (cells.length < 4) {
      continue;
    }

    const rankTeamLines = cells[0].split("\n").map((line) => line.trim()).filter(Boolean);
    const finalLines = cells[1].split("\n").map((line) => line.trim()).filter(Boolean);
    const outwardLines = cells[2].split("\n").map((line) => line.trim()).filter(Boolean);
    const returnLines = cells[3].split("\n").map((line) => line.trim()).filter(Boolean);

    const teamName = rankTeamLines.at(-1) ?? "";
    if (!teamName) {
      continue;
    }

    results.push({
      finalRank: parseIntField(rankTeamLines[0] ?? null),
      teamName,
      finalMark: finalLines.at(-1) ?? null,
      outwardRank: parseIntField(outwardLines[0] ?? null),
      outwardMark: outwardLines.at(-1) ?? null,
      returnRank: parseIntField(returnLines[0] ?? null),
      returnMark: returnLines.at(-1) ?? null,
    });
  }

  return results;
}

function parseChitenEntries(rawJson: string) {
  return JSON.parse(rawJson) as HakoneChitenEntry[];
}

function parseSokuhouEntries(rawJson: string) {
  const parsed = JSON.parse(rawJson) as HakoneSokuhouResponse;
  return parsed.RECORD?.SOGOU ?? [];
}

function parseGapMark(value: string | null | undefined) {
  const normalized = String(value ?? "").replace(/\s/g, "").trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

function buildSnapshotNotes(entry: HakoneSokuhouTeamEntry) {
  const notes: string[] = [];
  const officialFlag = String(entry.KOUSIKI_FLG ?? "").trim();
  const kuriageFlag = String(entry.KURIAGE_FLG ?? "").trim();

  if (officialFlag && officialFlag !== "1") {
    notes.push(`official-flag:${officialFlag}`);
  }

  if (kuriageFlag && kuriageFlag !== "0") {
    notes.push("繰り上げ");
  }

  return notes.length > 0 ? notes.join(" / ") : null;
}

function resolveTerminalChitenIds(entries: HakoneChitenEntry[]) {
  const lastByLeg = new Map<number, string>();

  for (const entry of entries) {
    const chitenId = String(entry.CHITEN_ID ?? "").trim();
    const kukanLabel = String(entry.KUKAN ?? "").trim();
    const legMatch = kukanLabel.match(/^(\d+)区$/);
    if (!chitenId || !legMatch) {
      continue;
    }

    const leg = Number(legMatch[1]);
    const existing = lastByLeg.get(leg);
    if (!existing || chitenId > existing) {
      lastByLeg.set(leg, chitenId);
    }
  }

  if (lastByLeg.size < 10) {
    throw new Error(`Expected 10 leg terminal checkpoints, found ${lastByLeg.size}`);
  }

  return Array.from(lastByLeg.entries()).sort((left, right) => left[0] - right[0]);
}

function buildOrganizationAliasMap(
  organizations: Array<{ id: string; slug: string; nameJa: string; shortName: string | null }>,
) {
  const map = new Map<string, { id: string; slug: string; nameJa: string }>();

  for (const organization of organizations) {
    const candidates = new Set<string>([
      organization.nameJa,
      organization.shortName ?? "",
      organization.nameJa.replace(/大学/g, "大"),
      organization.nameJa.replace(/大學/g, "大"),
      organization.nameJa.replace(/附属/g, "付属"),
      organization.nameJa.replace(/國學院/g, "国学院"),
    ]);

    for (const candidate of candidates) {
      const normalized = normalizeTeamLabel(candidate);
      if (!normalized || map.has(normalized)) {
        continue;
      }

      map.set(normalized, {
        id: organization.id,
        slug: organization.slug,
        nameJa: organization.nameJa,
      });
    }
  }

  return map;
}

function resolveOrganization(
  aliasMap: Map<string, { id: string; slug: string; nameJa: string }>,
  rawName: string,
) {
  const normalized = normalizeTeamLabel(rawName);
  const candidates = new Set<string>([
    normalized,
    normalized.replace(/大$/, "大学"),
    normalized.replace(/国学院大学$/, "國學院大學"),
    normalized.replace(/國學院大学$/, "國學院大學"),
    normalized.replace(/学院大学$/, "學院大學"),
  ]);

  if (normalized.includes("関東学生連合")) {
    candidates.add("関東学生連合");
  }

  for (const candidate of candidates) {
    const matched = aliasMap.get(candidate);
    if (matched) {
      return matched;
    }
  }

  return null;
}

async function ensureOfficialSource(edition: number) {
  return prisma.source.upsert({
    where: { id: buildHakoneOfficialSourceId(edition) },
    create: {
      id: buildHakoneOfficialSourceId(edition),
      name: `箱根駅伝公式 第${edition}回大会詳細`,
      url: buildHakoneOfficialUrl(edition),
      type: SourceType.hakone_official,
      reliability: 5,
      notes: `第${edition}回箱根駅伝の公式大会詳細表。チーム最終順位と総合記録の回填に使用。`,
    },
    update: {
      name: `箱根駅伝公式 第${edition}回大会詳細`,
      url: buildHakoneOfficialUrl(edition),
      type: SourceType.hakone_official,
      reliability: 5,
    },
  });
}

async function ensureSokuhouSource(edition: number) {
  return prisma.source.upsert({
    where: { id: buildHakoneSokuhouSourceId(edition) },
    create: {
      id: buildHakoneSokuhouSourceId(edition),
      name: `日本テレビ 第${edition}回箱根駅伝 速報詳細`,
      url: buildHakoneSokuhouUrl(edition, "020"),
      type: SourceType.ntv,
      reliability: 4,
      notes: `第${edition}回箱根駅伝の速報詳細 JSON。各区終了時点の团队累计順位・累计記録・首位差回填に使用。`,
    },
    update: {
      name: `日本テレビ 第${edition}回箱根駅伝 速報詳細`,
      url: buildHakoneSokuhouUrl(edition, "020"),
      type: SourceType.ntv,
      reliability: 4,
    },
  });
}

async function backfillEdition(edition: number, aliasMap: Map<string, { id: string; slug: string; nameJa: string }>) {
  const [officialHtml, chitenJson, officialSource, sokuhouSource, competitionEdition] = await Promise.all([
    loadOfficialHtml(edition),
    loadChitenJson(edition),
    ensureOfficialSource(edition),
    ensureSokuhouSource(edition),
    prisma.competitionEdition.findUnique({
      where: { slug: `hakone-ekiden-${edition}` },
      select: { id: true, slug: true },
    }),
  ]);

  if (!competitionEdition) {
    throw new Error(`Missing competition edition hakone-ekiden-${edition}`);
  }

  const finalResults = parseOfficialTeamRows(officialHtml);
  const terminalChitenIds = resolveTerminalChitenIds(parseChitenEntries(chitenJson));
  const missingTeams = new Set<string>();

  let resultCount = 0;
  let snapshotCount = 0;
  const teamResultMap = new Map<string, { id: string }>();

  for (const entry of finalResults) {
    const organization = resolveOrganization(aliasMap, entry.teamName);
    if (!organization) {
      missingTeams.add(entry.teamName);
      continue;
    }

    const teamResult = await prisma.teamCompetitionResult.upsert({
      where: {
        competitionEditionId_organizationId: {
          competitionEditionId: competitionEdition.id,
          organizationId: organization.id,
        },
      },
      create: {
        competitionEditionId: competitionEdition.id,
        organizationId: organization.id,
        finalRank: entry.finalRank,
        finalMark: entry.finalMark,
        finalMarkMillis: entry.finalMark ? markToMilliseconds(entry.finalMark) : null,
        status: DataStatus.pending,
        notes:
          entry.outwardRank || entry.returnRank
            ? `往路 ${entry.outwardRank ?? "-"}位 ${entry.outwardMark ?? "-"} / 復路 ${entry.returnRank ?? "-"}位 ${entry.returnMark ?? "-"}`
            : null,
        sourceId: officialSource.id,
      },
      update: {
        finalRank: entry.finalRank,
        finalMark: entry.finalMark,
        finalMarkMillis: entry.finalMark ? markToMilliseconds(entry.finalMark) : null,
        notes:
          entry.outwardRank || entry.returnRank
            ? `往路 ${entry.outwardRank ?? "-"}位 ${entry.outwardMark ?? "-"} / 復路 ${entry.returnRank ?? "-"}位 ${entry.returnMark ?? "-"}`
            : null,
        sourceId: officialSource.id,
      },
      select: { id: true },
    });

    teamResultMap.set(organization.id, teamResult);
    resultCount += 1;
  }
  const snapshotCountByLeg = new Map<number, number>();

  for (const [leg, chitenId] of terminalChitenIds) {
    // Team snapshots must come from team-level live result feeds, not reconstructed runner results.
    const sokuhouEntries = parseSokuhouEntries(await loadSokuhouJson(edition, chitenId));

    for (const entry of sokuhouEntries) {
      const teamName = String(entry.TEAM_NAME ?? "").trim();
      if (!teamName) {
        continue;
      }

      const organization = resolveOrganization(aliasMap, teamName);
      if (!organization) {
        missingTeams.add(teamName);
        continue;
      }

      const teamResult = teamResultMap.get(organization.id);
      if (!teamResult) {
        continue;
      }

      const cumulativeMark = parseGapMark(entry.SOGO_TIME);
      const gapFromLeader = parseGapMark(entry.TIME_DIF_F1);

      await prisma.teamCompetitionLegSnapshot.upsert({
        where: {
          teamCompetitionResultId_leg: {
            teamCompetitionResultId: teamResult.id,
            leg,
          },
        },
        create: {
          teamCompetitionResultId: teamResult.id,
          leg,
          cumulativeRank: parseIntField(entry.SOGOU_JUNI),
          cumulativeMark,
          cumulativeMarkMillis: cumulativeMark ? markToMilliseconds(cumulativeMark) : null,
          gapFromLeader,
          gapFromLeaderMillis: gapFromLeader ? markToMilliseconds(gapFromLeader) : null,
          status: DataStatus.pending,
          notes: buildSnapshotNotes(entry),
          sourceId: sokuhouSource.id,
        },
        update: {
          cumulativeRank: parseIntField(entry.SOGOU_JUNI),
          cumulativeMark,
          cumulativeMarkMillis: cumulativeMark ? markToMilliseconds(cumulativeMark) : null,
          gapFromLeader,
          gapFromLeaderMillis: gapFromLeader ? markToMilliseconds(gapFromLeader) : null,
          notes: buildSnapshotNotes(entry),
          sourceId: sokuhouSource.id,
        },
      });

      snapshotCount += 1;
      snapshotCountByLeg.set(leg, (snapshotCountByLeg.get(leg) ?? 0) + 1);
    }
  }

  const incompleteLegs = terminalChitenIds
    .map(([leg]) => ({
      leg,
      count: snapshotCountByLeg.get(leg) ?? 0,
    }))
    .filter((entry) => entry.count < resultCount);

  if (incompleteLegs.length > 0) {
    throw new Error(
      `Edition ${edition} snapshot backfill incomplete: ${incompleteLegs
        .map((entry) => `${entry.leg}区=${entry.count}/${resultCount}`)
        .join(", ")}`,
    );
  }

  return {
    edition,
    competitionEditionSlug: competitionEdition.slug,
    resultCount,
    snapshotCount,
    missingTeams: [...missingTeams].sort((left, right) => left.localeCompare(right, "ja")),
  };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const editions =
    rawArgs.length > 0
      ? rawArgs.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
      : [97, 98, 99, 100, 101, 102];

  if (editions.length === 0) {
    throw new Error("Usage: tsx scripts/maintenance/backfill-hakone-team-results.ts [edition...]");
  }

  const organizations = await prisma.organization.findMany({
    where: {
      type: {
        in: [OrganizationType.university, OrganizationType.federation],
      },
    },
    select: {
      id: true,
      slug: true,
      nameJa: true,
      shortName: true,
    },
  });

  const aliasMap = buildOrganizationAliasMap(organizations);
  const summaries = [];

  for (const edition of editions) {
    summaries.push(await backfillEdition(edition, aliasMap));
  }

  console.log(JSON.stringify({ editions: summaries }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
