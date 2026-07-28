import { publicCompetitionTypes } from "@/lib/public-competitions";
import { prisma } from "@/lib/prisma";
import {
  shouldIndexCompetitionPage,
  shouldIndexOrganizationPage,
  shouldIndexPlayerPage,
} from "@/lib/seo";

export async function getIndexablePlayers() {
  const players = await prisma.person.findMany({
    select: {
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
  });

  return players.filter((player) =>
    shouldIndexPlayerPage({
      slug: player.slug,
      memberships: player._count.memberships,
      personalBests: player._count.personalBests,
      results: player._count.raceResults,
    }),
  );
}

export async function getIndexableOrganizations() {
  const organizations = await prisma.organization.findMany({
    select: {
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
  });

  return organizations.filter((organization) =>
    shouldIndexOrganizationPage({
      slug: organization.slug,
      memberships: organization._count.memberships,
      raceResults: organization._count.raceResults,
      teamResults: organization._count.teamCompetitionResults,
    }),
  );
}

export async function getIndexableCompetitions() {
  const competitions = await prisma.competitionEdition.findMany({
    where: {
      competition: {
        type: {
          in: publicCompetitionTypes,
        },
      },
    },
    select: {
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
  });

  return competitions.filter((competition) => {
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
