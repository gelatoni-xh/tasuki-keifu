import { unstable_cache } from "next/cache";
import type { CompetitionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicCompetitionTypes } from "@/lib/public-competitions";
import { getEkidenAwards, rankFeaturedTeams } from "@/lib/home-highlights";

const ekidenTypes: CompetitionType[] = ["university_ekiden", "high_school_ekiden", "corporate_ekiden", "mixed_ekiden"];

export const getHomeDiscovery = unstable_cache(async () => {
  const now = new Date();
  const [recentCompetitions, latestEkiden, teamGroups] = await Promise.all([
    prisma.competitionEdition.findMany({
      where: {
        competition: { type: { in: publicCompetitionTypes } },
        startsOn: { lte: now },
        OR: [
          { races: { some: { raceResults: { some: {} } } } },
          { teamCompetitionResults: { some: {} } },
        ],
      },
      orderBy: [{ startsOn: "desc" }, { slug: "asc" }],
      take: 5,
      select: { slug: true, officialName: true, startsOn: true, competition: { select: { type: true } } },
    }),
    prisma.competitionEdition.findFirst({
      where: {
        competition: { type: { in: ekidenTypes } },
        startsOn: { lte: now },
        races: { some: { leg: { gt: 0 }, raceResults: { some: { markMillis: { gt: 0 } } } } },
      },
      orderBy: [{ startsOn: "desc" }, { slug: "asc" }],
      select: {
        slug: true,
        officialName: true,
        races: {
          where: { leg: { gt: 0 } },
          orderBy: [{ leg: "asc" }, { slug: "asc" }],
          select: {
            slug: true, name: true,
            raceResults: {
              where: { markMillis: { gt: 0 }, status: { notIn: ["conflicting", "missing"] }, notes: { contains: "区間" } },
              orderBy: [{ rank: "asc" }, { id: "asc" }],
              select: { id: true, mark: true, notes: true, person: { select: { slug: true, displayNameJa: true } }, organization: { select: { slug: true, nameJa: true } } },
            },
          },
        },
      },
    }),
    Promise.all(ekidenTypes.map(async (type) => {
      const editions = await prisma.competitionEdition.findMany({
        where: {
          competition: { type }, startsOn: { lte: now },
          teamCompetitionResults: { some: { finalRank: { gte: 1, lte: 5 }, status: { notIn: ["conflicting", "missing"] } } },
        },
        orderBy: [{ startsOn: "desc" }, { slug: "asc" }],
        take: 5,
        select: {
          slug: true, officialName: true,
          teamCompetitionResults: {
            where: { finalRank: { gte: 1, lte: 5 }, status: { notIn: ["conflicting", "missing"] } },
            select: { finalRank: true, notes: true, organization: { select: { slug: true, nameJa: true } } },
          },
        },
      });
      return { type, editions: editions.map(({ slug, officialName }) => ({ slug, officialName })), teams: rankFeaturedTeams(editions) };
    })),
  ]);
  return {
    recentCompetitions: recentCompetitions.map((edition) => ({ ...edition, startsOn: edition.startsOn?.toISOString() ?? null })),
    teamGroups: teamGroups.filter((group) => group.teams.length > 0),
    latestEkiden: latestEkiden ? {
      slug: latestEkiden.slug,
      officialName: latestEkiden.officialName,
      legs: latestEkiden.races.map((race) => ({
        slug: race.slug,
        name: race.name,
        results: race.raceResults.map((result) => ({ ...result, awards: getEkidenAwards(result.notes) })).filter((result) => result.awards.length > 0),
      })).filter((leg) => leg.results.length > 0),
    } : null,
  };
}, ["home-discovery-v1"], { revalidate: 3600, tags: ["home-discovery"] });
