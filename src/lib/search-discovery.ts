import { publicCompetitionTypes } from "@/lib/public-competitions";
import { prisma } from "@/lib/prisma";
import {
  MIN_INDEXABLE_RACE_FINISHERS,
  shouldIndexCompetitionPage,
  shouldIndexOrganizationPage,
  shouldIndexPlayerPage,
} from "@/lib/seo";

type ContentChange = { id: string; updatedAt: Date };

function applyContentChanges<T extends { id: string; updatedAt: Date }>(items: T[], changes: ContentChange[]) {
  const latest = new Map(changes.map((change) => [change.id, change.updatedAt]));
  return items.map((item) => {
    const changedAt = latest.get(item.id);
    return { ...item, updatedAt: changedAt && changedAt > item.updatedAt ? changedAt : item.updatedAt };
  });
}

export async function getIndexablePlayers() {
  const [players, changes] = await Promise.all([prisma.person.findMany({
    select: {
      id: true,
      slug: true,
      updatedAt: true,
      _count: {
        select: {
          memberships: true,
          personalBests: true,
          raceResults: true,
        },
      },
    },
  }), prisma.$queryRaw<ContentChange[]>`
    SELECT "personId" AS id, max("updatedAt") AS "updatedAt" FROM (
      SELECT "personId", "updatedAt" FROM "RaceResult"
      UNION ALL SELECT "personId", "updatedAt" FROM "Membership"
      UNION ALL SELECT "personId", "updatedAt" FROM "PersonalBest"
    ) changes GROUP BY "personId"
  `]);

  return applyContentChanges(players, changes).filter((player) =>
    shouldIndexPlayerPage({
      slug: player.slug,
      memberships: player._count.memberships,
      personalBests: player._count.personalBests,
      results: player._count.raceResults,
    }),
  );
}

export async function getIndexableOrganizations() {
  const [organizations, changes] = await Promise.all([prisma.organization.findMany({
    select: {
      id: true,
      slug: true,
      updatedAt: true,
      _count: {
        select: {
          memberships: true,
          raceResults: true,
          teamCompetitionResults: true,
        },
      },
    },
  }), prisma.$queryRaw<ContentChange[]>`
    SELECT "organizationId" AS id, max("updatedAt") AS "updatedAt" FROM (
      SELECT "organizationId", "updatedAt" FROM "Membership"
      UNION ALL SELECT "organizationId", "updatedAt" FROM "RaceResult" WHERE "organizationId" IS NOT NULL
      UNION ALL SELECT "organizationId", "updatedAt" FROM "TeamCompetitionResult"
    ) changes GROUP BY "organizationId"
  `]);

  return applyContentChanges(organizations, changes).filter((organization) =>
    shouldIndexOrganizationPage({
      slug: organization.slug,
      memberships: organization._count.memberships,
      raceResults: organization._count.raceResults,
      teamResults: organization._count.teamCompetitionResults,
    }),
  );
}

export async function getIndexableCompetitions() {
  const [competitions, changes] = await Promise.all([prisma.competitionEdition.findMany({
    where: {
      competition: {
        type: {
          in: publicCompetitionTypes,
        },
      },
    },
    select: {
      id: true,
      slug: true,
      updatedAt: true,
      teamCompetitionResults: {
        select: {
          id: true,
        },
      },
      races: {
        select: {
          id: true,
          _count: {
            select: {
              raceResults: true,
            },
          },
        },
      },
    },
  }), prisma.$queryRaw<ContentChange[]>`
    SELECT "competitionEditionId" AS id, max("updatedAt") AS "updatedAt" FROM (
      SELECT "competitionEditionId", "updatedAt" FROM "Race"
      UNION ALL SELECT r."competitionEditionId", rr."updatedAt" FROM "RaceResult" rr JOIN "Race" r ON r.id = rr."raceId"
      UNION ALL SELECT "competitionEditionId", "updatedAt" FROM "TeamCompetitionResult"
      UNION ALL SELECT t."competitionEditionId", s."updatedAt" FROM "TeamCompetitionLegSnapshot" s JOIN "TeamCompetitionResult" t ON t.id = s."teamCompetitionResultId"
      UNION ALL SELECT e.id, c."updatedAt" FROM "CompetitionEdition" e JOIN "Competition" c ON c.id = e."competitionId"
    ) changes GROUP BY "competitionEditionId"
  `]);

  return applyContentChanges(competitions, changes).filter((competition) => {
    const raceCount = competition.races.length;
    const resultCount = competition.races.reduce((sum, race) => sum + race._count.raceResults, 0);
    const teamResultCount = competition.teamCompetitionResults.length;

    return shouldIndexCompetitionPage({
      raceCount,
      resultCount,
      teamResultCount,
    });
  });
}

export async function getIndexableCompetitionRaces() {
  const races = await prisma.race.findMany({
    where: {
      raceResults: { some: {} },
      competitionEdition: { competition: { type: { in: publicCompetitionTypes } } },
    },
    select: {
      slug: true, updatedAt: true,
      competitionEdition: { select: { slug: true, updatedAt: true, competition: { select: { updatedAt: true } } } },
      raceResults: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      _count: { select: { raceResults: { where: { mark: { not: null }, OR: [{ markMillis: { gt: 0 } }, { rank: { gt: 0 } }] } } } },
    },
  });
  return races.filter((race) => race._count.raceResults >= MIN_INDEXABLE_RACE_FINISHERS).map((race) => ({
    slug: race.slug,
    editionSlug: race.competitionEdition.slug,
    updatedAt: new Date(Math.max(
      race.updatedAt.getTime(), race.competitionEdition.updatedAt.getTime(),
      race.competitionEdition.competition.updatedAt.getTime(),
      race.raceResults[0]?.updatedAt.getTime() ?? 0,
    )),
  }));
}
