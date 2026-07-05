import { buildDirectMatchups } from "@/lib/player-relations/build-direct-matchups";
import { buildRelationContext } from "@/lib/player-relations/build-relation-context";
import type { PlayerRelationCachePayload, PlayerRelationContext } from "@/lib/player-relations/types";

function emptyContext(): PlayerRelationContext {
  return {
    sharedTeamStages: [],
    sharedHometown: false,
    sharedHighSchool: false,
    sharedUniversity: false,
  };
}

export async function buildPlayerRelations(personId: string): Promise<PlayerRelationCachePayload> {
  const directMatchups = await buildDirectMatchups(personId);
  const relatedPersonIds = [...directMatchups.keys()];
  const relationContext = await buildRelationContext(personId, relatedPersonIds);

  const topRelations = [...directMatchups.values()]
    .map((aggregate) => {
      const latestRace = [...aggregate.races].sort(
        (left, right) => (right.startsAt?.getTime() ?? 0) - (left.startsAt?.getTime() ?? 0),
      )[0];
      const contextAggregate = relationContext.get(aggregate.relatedPersonId);

      return {
        relatedPersonId: aggregate.relatedPersonId,
        matchupCount: aggregate.count,
        latestMatchAt: latestRace?.startsAt?.toISOString() ?? null,
        latestCompetitionEditionId: latestRace?.competitionEditionId ?? null,
        latestCompetitionName: latestRace?.competitionName ?? null,
        stageCount: aggregate.stages.size,
        hasHeadToHeadDetail: aggregate.count >= 5,
        context: contextAggregate
          ? {
              sharedTeamStages: [...contextAggregate.sharedTeamStages],
              sharedHometown: contextAggregate.sharedHometown,
              sharedHighSchool: contextAggregate.sharedHighSchool,
              sharedUniversity: contextAggregate.sharedUniversity,
            }
          : emptyContext(),
      };
    })
    .sort((left, right) => {
      if (right.matchupCount !== left.matchupCount) {
        return right.matchupCount - left.matchupCount;
      }

      const rightTime = Date.parse(right.latestMatchAt ?? "") || 0;
      const leftTime = Date.parse(left.latestMatchAt ?? "") || 0;

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      if (right.stageCount !== left.stageCount) {
        return right.stageCount - left.stageCount;
      }

      return left.relatedPersonId.localeCompare(right.relatedPersonId);
    })
    .slice(0, 12);

  return {
    personId,
    generatedAt: new Date().toISOString(),
    topRelations,
  };
}
