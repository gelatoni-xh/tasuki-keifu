import { buildDirectMatchups } from "@/lib/player-relations/build-direct-matchups";
import { buildRelationContext } from "@/lib/player-relations/build-relation-context";
import { buildPlayerRelationLabels, buildPlayerRelationScore } from "@/lib/player-relations/score-player-relations";
import type { PlayerRelationCachePayload, PlayerRelationContext } from "@/lib/player-relations/types";

function emptyContext(): PlayerRelationContext {
  return {
    sameHometown: false,
    sharedOrigins: {
      juniorHighSchool: false,
      highSchool: false,
      university: false,
      corporateTeam: false,
    },
    teamOverlapYears: {
      juniorHighSchool: undefined,
      highSchool: undefined,
      university: undefined,
    },
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
      const latestRace = [...aggregate.races].sort((left, right) => {
        const leftTime = (left.startsAt ?? left.competitionEditionStartsOn)?.getTime() ?? 0;
        const rightTime = (right.startsAt ?? right.competitionEditionStartsOn)?.getTime() ?? 0;

        return rightTime - leftTime;
      })[0];
      const contextAggregate = relationContext.get(aggregate.relatedPersonId);
      const signals = {
        matchupCount: aggregate.count,
        matchupYearCount: new Set(
          aggregate.races
            .map((race) => race.startsAt ?? race.competitionEditionStartsOn)
            .filter((date): date is Date => date instanceof Date),
        ).size,
        stageCount: aggregate.stages.size,
        ekidenCount: aggregate.ekidenCount,
        latestMatchAt: latestRace ? (latestRace.startsAt ?? latestRace.competitionEditionStartsOn)?.toISOString() ?? null : null,
      };
      const context = contextAggregate
        ? {
            sameHometown: contextAggregate.sameHometown,
            sharedOrigins: contextAggregate.sharedOrigins,
            teamOverlapYears: contextAggregate.teamOverlapYears,
            sharedTeamStages: [...contextAggregate.sharedTeamStages],
            sharedHometown: contextAggregate.sharedHometown,
            sharedHighSchool: contextAggregate.sharedHighSchool,
            sharedUniversity: contextAggregate.sharedUniversity,
          }
        : emptyContext();
      const labels = buildPlayerRelationLabels(context, signals);
      const score = buildPlayerRelationScore(context, signals);

      return {
        relatedPersonId: aggregate.relatedPersonId,
        matchupCount: aggregate.count,
        matchupSignals: signals,
        labels,
        rawScore: score.rawScore,
        displayScore: score.displayScore,
        latestMatchAt: signals.latestMatchAt,
        latestCompetitionEditionId: latestRace?.competitionEditionId ?? null,
        latestCompetitionName: latestRace?.competitionName ?? null,
        stageCount: aggregate.stages.size,
        hasHeadToHeadDetail: aggregate.count >= 5,
        context,
      };
    })
    .sort((left, right) => {
      if (right.rawScore !== left.rawScore) {
        return right.rawScore - left.rawScore;
      }

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
    .filter((entry) => entry.rawScore >= 15);

  return {
    personId,
    generatedAt: new Date().toISOString(),
    topRelations,
  };
}
