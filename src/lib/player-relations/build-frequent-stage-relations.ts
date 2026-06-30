import { prisma } from "@/lib/prisma";
import type { FrequentStageAggregate, RelationStageKey } from "@/lib/player-relations/types";

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

export async function buildFrequentStageRelations(personId: string) {
  const playerResults = await prisma.raceResult.findMany({
    where: { personId },
    select: {
      raceId: true,
      organization: {
        select: {
          type: true,
        },
      },
      race: {
        select: {
          competitionEditionId: true,
        },
      },
    },
  });

  if (playerResults.length === 0) {
    return new Map<string, FrequentStageAggregate>();
  }

  const raceIds = Array.from(new Set(playerResults.map((result) => result.raceId)));
  const editionIds = Array.from(new Set(playerResults.map((result) => result.race.competitionEditionId)));
  const playerStages = new Set(
    playerResults
      .map((result) => getStageLabel(result.organization?.type))
      .filter((value): value is NonNullable<ReturnType<typeof getStageLabel>> => value !== null),
  );

  const relatedResults = await prisma.raceResult.findMany({
    where: {
      personId: { not: personId },
      raceId: { notIn: raceIds },
      race: {
        competitionEditionId: { in: editionIds },
      },
    },
    select: {
      personId: true,
      organization: {
        select: {
          type: true,
        },
      },
      race: {
        select: {
          competitionEditionId: true,
        },
      },
    },
  });

  const aggregates = new Map<string, FrequentStageAggregate>();

  for (const result of relatedResults) {
    const stageLabel = getStageLabel(result.organization?.type);

    if (stageLabel && playerStages.size > 0 && !playerStages.has(stageLabel)) {
      continue;
    }

    const current: FrequentStageAggregate = aggregates.get(result.personId) ?? {
      relatedPersonId: result.personId,
      count: 0,
      stages: new Set<RelationStageKey>(),
    };

    current.count += 1;

    if (stageLabel) {
      current.stages.add(stageLabel);
    }

    aggregates.set(result.personId, current);
  }

  return aggregates;
}
