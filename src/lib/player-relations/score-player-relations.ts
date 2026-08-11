import type {
  PlayerRelationContext,
  PlayerRelationEntry,
  PlayerRelationLabelItem,
  PlayerRelationLabels,
  PlayerRelationSignals,
} from "@/lib/player-relations/types";

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function getLabelContribution(
  label: string,
  context: PlayerRelationContext,
  signals: PlayerRelationSignals,
) {
  switch (label) {
    case "same_hometown":
      return 3;
    case "same_junior_high_origin":
      return 5;
    case "same_high_school_origin":
      return 6;
    case "same_university_origin":
      return 5;
    case "same_corporate_team_origin":
      return 4;
    case "same_junior_high_team":
      return 8 + 2 * (context.teamOverlapYears.juniorHighSchool ?? 0);
    case "same_high_school_team":
      return 10 + 2 * (context.teamOverlapYears.highSchool ?? 0);
    case "same_university_team":
      return 9 + 1.5 * (context.teamOverlapYears.university ?? 0);
    case "frequent_matchup":
      return 6 * Math.log1p(signals.matchupCount);
    case "long_term_matchup":
      return 5 * Math.log1p(signals.matchupYearCount);
    case "cross_stage_matchup":
      return 4 * Math.max(signals.stageCount - 1, 0);
    default:
      return 0;
  }
}

function sortContributions(contributions: Array<PlayerRelationLabelItem | null>) {
  return contributions.filter((item): item is PlayerRelationLabelItem => item !== null).sort((left, right) => {
    if (right.contribution !== left.contribution) {
      return right.contribution - left.contribution;
    }

    return left.label.localeCompare(right.label, "en");
  });
}

export function buildPlayerRelationLabels(
  context: PlayerRelationContext,
  signals: PlayerRelationSignals,
): PlayerRelationLabels {
  const info = sortContributions([
    context.sameHometown ? { label: "same_hometown", contribution: getLabelContribution("same_hometown", context, signals) } : null,
    context.sharedOrigins.juniorHighSchool
      ? { label: "same_junior_high_origin", contribution: getLabelContribution("same_junior_high_origin", context, signals) }
      : null,
    context.sharedOrigins.highSchool
      ? { label: "same_high_school_origin", contribution: getLabelContribution("same_high_school_origin", context, signals) }
      : null,
    context.sharedOrigins.university
      ? { label: "same_university_origin", contribution: getLabelContribution("same_university_origin", context, signals) }
      : null,
    context.sharedOrigins.corporateTeam
      ? { label: "same_corporate_team_origin", contribution: getLabelContribution("same_corporate_team_origin", context, signals) }
      : null,
    context.teamOverlapYears.juniorHighSchool
      ? { label: "same_junior_high_team", contribution: getLabelContribution("same_junior_high_team", context, signals) }
      : null,
    context.teamOverlapYears.highSchool
      ? { label: "same_high_school_team", contribution: getLabelContribution("same_high_school_team", context, signals) }
      : null,
    context.teamOverlapYears.university
      ? { label: "same_university_team", contribution: getLabelContribution("same_university_team", context, signals) }
      : null,
  ].map((item) =>
    item
      ? {
          ...item,
          contribution: Math.round(item.contribution * 10) / 10,
        }
      : null,
  ));

  const matchup = sortContributions([
    signals.matchupCount >= 4
      ? { label: "frequent_matchup", contribution: getLabelContribution("frequent_matchup", context, signals) }
      : null,
    signals.matchupYearCount >= 3
      ? { label: "long_term_matchup", contribution: getLabelContribution("long_term_matchup", context, signals) }
      : null,
    signals.stageCount >= 2
      ? { label: "cross_stage_matchup", contribution: getLabelContribution("cross_stage_matchup", context, signals) }
      : null,
  ].map((item) =>
    item
      ? {
          ...item,
          contribution: Math.round(item.contribution * 10) / 10,
        }
      : null,
  ));

  return {
    info,
    matchup,
  };
}

export function buildPlayerRelationScore(
  context: PlayerRelationContext,
  signals: PlayerRelationSignals,
) {
  const infoScore =
    (context.sameHometown ? 3 : 0) +
    (context.sharedOrigins.juniorHighSchool ? 5 : 0) +
    (context.sharedOrigins.highSchool ? 6 : 0) +
    (context.sharedOrigins.university ? 5 : 0) +
    (context.sharedOrigins.corporateTeam ? 4 : 0) +
    (context.teamOverlapYears.juniorHighSchool ? 8 + 2 * context.teamOverlapYears.juniorHighSchool : 0) +
    (context.teamOverlapYears.highSchool ? 10 + 2 * context.teamOverlapYears.highSchool : 0) +
    (context.teamOverlapYears.university ? 9 + 1.5 * context.teamOverlapYears.university : 0);

  const matchupScore =
    6 * Math.log1p(signals.matchupCount) +
    5 * Math.log1p(signals.matchupYearCount) +
    4 * Math.max(signals.stageCount - 1, 0);

  const recencyBonus = signals.latestMatchAt
    ? Date.parse(signals.latestMatchAt) >= Date.now() - 1000 * 60 * 60 * 24 * 365 * 2
      ? 2
      : Date.parse(signals.latestMatchAt) >= Date.now() - 1000 * 60 * 60 * 24 * 365 * 4
        ? 1
        : 0
    : 0;

  const rawScore = roundToOneDecimal(infoScore + matchupScore + recencyBonus);
  const displayScore = rawScore;

  return {
    rawScore,
    displayScore,
    scoreBreakdown: {
      infoScore: roundToOneDecimal(infoScore),
      matchupScore: roundToOneDecimal(matchupScore),
      recencyBonus,
    },
  };
}

export function getRelationDisplayLabels(entry: Pick<PlayerRelationEntry, "labels">) {
  return [...entry.labels.info, ...entry.labels.matchup]
    .sort((left, right) => {
      if (right.contribution !== left.contribution) {
        return right.contribution - left.contribution;
      }

      return left.label.localeCompare(right.label, "en");
    })
    .map((item) => item.label);
}
