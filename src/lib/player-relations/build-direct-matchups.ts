import { prisma } from "@/lib/prisma";
import type { DirectMatchupAggregate, RelationStageKey } from "@/lib/player-relations/types";

function getStageLabel(organizationType: string | null | undefined): RelationStageKey | null {
  switch (organizationType) {
    case "high_school":
      return "high_school";
    case "university":
      return "university";
    case "corporate_team":
      return "corporate_team";
    default:
      return null;
  }
}

export async function buildDirectMatchups(personId: string) {
  const playerResults = await prisma.raceResult.findMany({
    where: { personId },
    select: {
      raceId: true,
      organization: {
        select: {
          type: true,
        },
      },
    },
  });

  const raceIds = Array.from(new Set(playerResults.map((result) => result.raceId)));

  if (raceIds.length === 0) {
    return new Map<string, DirectMatchupAggregate>();
  }

  const stageByRaceId = new Map(
    playerResults.map((result) => [result.raceId, getStageLabel(result.organization?.type)]),
  );

  const opponentResults = await prisma.raceResult.findMany({
    where: {
      raceId: { in: raceIds },
      personId: { not: personId },
    },
    select: {
      personId: true,
      raceId: true,
      organization: {
        select: {
          type: true,
        },
      },
      race: {
        select: {
          name: true,
          leg: true,
          startsAt: true,
          competitionEdition: {
            select: {
              officialName: true,
              competition: {
                select: {
                  type: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const aggregates = new Map<string, DirectMatchupAggregate>();

  for (const result of opponentResults) {
    const current: DirectMatchupAggregate = aggregates.get(result.personId) ?? {
      relatedPersonId: result.personId,
      count: 0,
      ekidenCount: 0,
      stages: new Set<RelationStageKey>(),
      races: [],
    };

    current.count += 1;

    if (result.race.competitionEdition.competition.type?.includes("ekiden") || result.race.leg !== null) {
      current.ekidenCount += 1;
    }

    const stageLabel = stageByRaceId.get(result.raceId) ?? getStageLabel(result.organization?.type);

    if (stageLabel) {
      current.stages.add(stageLabel);
    }

    current.races.push({
      raceId: result.raceId,
      raceName: result.race.name,
      leg: result.race.leg,
      startsAt: result.race.startsAt,
      competitionType: result.race.competitionEdition.competition.type,
      competitionName: result.race.competitionEdition.officialName,
    });

    aggregates.set(result.personId, current);
  }

  return aggregates;
}
