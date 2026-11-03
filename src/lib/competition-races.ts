import { prisma } from "@/lib/prisma";
import { getScopeVersion } from "@/lib/cache-invalidation";
import { getCachedValue } from "@/lib/server-cache";
import { isPublicCompetitionType } from "@/lib/public-competitions";

export function buildCompetitionRacePath(editionSlug: string, raceSlug: string) {
  return `/competitions/${editionSlug}/races/${raceSlug}`;
}

export async function getCompetitionRace(editionSlug: string, raceSlug: string) {
  const version = await getScopeVersion("competition-detail");
  return getCachedValue(`competition:race-page:${editionSlug}:${raceSlug}:${version}`, 120_000, async () => {
    const race = await prisma.race.findFirst({
      where: { slug: raceSlug, competitionEdition: { slug: editionSlug } },
      include: {
        source: true,
        competitionEdition: { include: { competition: true, source: true } },
        raceResults: {
          select: {
            id: true, rank: true, mark: true, markMillis: true, notes: true, updatedAt: true,
            person: { select: { slug: true, displayNameJa: true } },
            organization: { select: { slug: true, nameJa: true } },
          },
          orderBy: [{ rank: "asc" }, { markMillis: "asc" }, { id: "asc" }],
        },
      },
    });
    return race && isPublicCompetitionType(race.competitionEdition.competition.type) ? race : null;
  });
}
