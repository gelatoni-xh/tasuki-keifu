import { prisma } from "@/lib/prisma";
import { getStageLabel } from "@/lib/player-relations/relation-helpers";
import type { DirectMatchupAggregate, RelationStageKey } from "@/lib/player-relations/types";

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
          competitionEditionId: true,
          name: true,
          discipline: true,
          leg: true,
          startsAt: true,
          competitionEdition: {
            select: {
              officialName: true,
              startsOn: true,
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
        competitionEditionId: result.race.competitionEditionId,
        competitionEditionStartsOn: result.race.competitionEdition.startsOn,
        competitionType: result.race.competitionEdition.competition.type,
        competitionName: result.race.competitionEdition.officialName,
        discipline: result.race.discipline,
      });

    aggregates.set(result.personId, current);
  }

  return aggregates;
}
