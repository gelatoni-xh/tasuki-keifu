import { buildDirectMatchups } from "@/lib/player-relations/build-direct-matchups";
import { buildFrequentStageRelations } from "@/lib/player-relations/build-frequent-stage-relations";
import { buildTeammateRelations } from "@/lib/player-relations/build-teammate-relations";
import type { PlayerRelationCachePayload, PlayerRelationEntry, RelationReason } from "@/lib/player-relations/types";

function createSummary() {
  return {
    directMatchupCount: 0,
    teammateOverlapYears: null as number | null,
    sameStageMeetCount: 0,
  };
}

function pushReason(existing: RelationReason[], next: RelationReason) {
  if (existing.some((reason) => JSON.stringify(reason) === JSON.stringify(next))) {
    return existing;
  }

  return [...existing, next].sort((left, right) => right.priority - left.priority).slice(0, 3);
}

function capTeammateReasons(reasons: RelationReason[]) {
  const teammateReasons = reasons
    .filter((reason) => reason.type === "teammate_overlap")
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 2);
  const nonTeammateReasons = reasons.filter((reason) => reason.type !== "teammate_overlap");

  if (teammateReasons.length === 0) {
    return reasons;
  }

  return [...teammateReasons, ...nonTeammateReasons]
    .sort((left, right) => right.priority - left.priority)
    .slice(0, Math.min(3, teammateReasons.length + nonTeammateReasons.length));
}

export async function buildPlayerRelations(personId: string): Promise<PlayerRelationCachePayload> {
  const [directMatchups, teammateRelations, frequentStageRelations] = await Promise.all([
    buildDirectMatchups(personId),
    buildTeammateRelations(personId),
    buildFrequentStageRelations(personId),
  ]);

  const merged = new Map<string, PlayerRelationEntry>();

  for (const [relatedPersonId, aggregate] of directMatchups.entries()) {
    const stages = Array.from(aggregate.stages);
    const reasons: RelationReason[] = [];

    if (aggregate.ekidenCount > 0) {
      reasons.push({
        type: "direct_matchup",
        kind: "ekiden",
        count: aggregate.ekidenCount,
        priority: 100,
      });
    }

    if (aggregate.stages.size >= 2) {
      reasons.push({
        type: "direct_matchup",
        kind: "cross_stage",
        count: aggregate.count,
        stages,
        priority: 90,
      });
    } else if (aggregate.count > aggregate.ekidenCount) {
      reasons.push({
        type: "direct_matchup",
        kind: "same_stage",
        count: aggregate.count,
        priority: 80,
      });
    }

    const latestRace = [...aggregate.races].sort(
      (left, right) => (right.startsAt?.getTime() ?? 0) - (left.startsAt?.getTime() ?? 0),
    )[0];

    if (latestRace) {
      reasons.push({
        type: "direct_matchup",
        kind: "latest_competition",
        competitionName: latestRace.competitionName,
        priority: 70,
      });
    }

    merged.set(relatedPersonId, {
      relatedPersonId,
      relationScore: aggregate.count * 10 + aggregate.ekidenCount * 5 + (aggregate.stages.size >= 2 ? 8 : 0),
      reasons: reasons.slice(0, 3),
      summary: {
        ...createSummary(),
        directMatchupCount: aggregate.count,
      },
      lastRelatedAt: latestRace?.startsAt?.toISOString() ?? null,
    });
  }

  for (const [relatedPersonId, aggregate] of teammateRelations.entries()) {
    const current = merged.get(relatedPersonId) ?? {
      relatedPersonId,
      relationScore: 0,
      reasons: [],
      summary: createSummary(),
      lastRelatedAt: null,
    };

    if (aggregate.overlapYears > 0) {
      current.reasons = pushReason(current.reasons, {
        type: "teammate_overlap",
        kind: "overlap_years",
        years: aggregate.overlapYears,
        priority: 60,
      });
      current.relationScore += 8 + aggregate.overlapYears * 2;
      current.summary.teammateOverlapYears = Math.max(current.summary.teammateOverlapYears ?? 0, aggregate.overlapYears);
    }

    if (aggregate.sharedEditionLabels.length > 0) {
      current.reasons = pushReason(current.reasons, {
        type: "teammate_overlap",
        kind: "shared_editions",
        editions: aggregate.sharedEditionLabels.slice(0, 2),
        priority: 55,
      });
      current.relationScore += aggregate.sharedEditionLabels.length * 4;
    }

    current.reasons = capTeammateReasons(current.reasons);
    merged.set(relatedPersonId, current);
  }

  for (const [relatedPersonId, aggregate] of frequentStageRelations.entries()) {
    const current = merged.get(relatedPersonId) ?? {
      relatedPersonId,
      relationScore: 0,
      reasons: [],
      summary: createSummary(),
      lastRelatedAt: null,
    };

    const alreadyHasTeammateContext = current.reasons.some((reason) => reason.type === "teammate_overlap");

    if (alreadyHasTeammateContext) {
      merged.set(relatedPersonId, current);
      continue;
    }

    if (aggregate.count > 1) {
      const stageLabel = Array.from(aggregate.stages)[0] ?? null;
      current.reasons = pushReason(current.reasons, {
        type: "frequent_same_stage",
        kind: "repeat_stage",
        stage: stageLabel,
        count: aggregate.count,
        priority: 40,
      });
      current.relationScore += aggregate.count * 3 + (aggregate.stages.size >= 2 ? 4 : 0);
      current.summary.sameStageMeetCount = Math.max(current.summary.sameStageMeetCount, aggregate.count);
      merged.set(relatedPersonId, current);
    }
  }

  const topRelations = [...merged.values()]
    .filter((entry) => entry.reasons.length > 0)
    .sort((left, right) => {
      if (right.relationScore !== left.relationScore) {
        return right.relationScore - left.relationScore;
      }

      if (right.summary.directMatchupCount !== left.summary.directMatchupCount) {
        return right.summary.directMatchupCount - left.summary.directMatchupCount;
      }

      return (Date.parse(right.lastRelatedAt ?? "") || 0) - (Date.parse(left.lastRelatedAt ?? "") || 0);
    })
    .slice(0, 12);

  return {
    personId,
    generatedAt: new Date().toISOString(),
    topRelations,
  };
}
