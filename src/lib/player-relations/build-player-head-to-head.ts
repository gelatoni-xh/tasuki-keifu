import { prisma } from "@/lib/prisma";
import { countOverlapYears, getStageLabel } from "@/lib/player-relations/relation-helpers";
import type {
  HeadToHeadComparisonStatus,
  HeadToHeadMatch,
  PlayerHeadToHeadPayload,
  PlayerRelationContext,
  RelationStageKey,
} from "@/lib/player-relations/types";

type SharedContextInput = {
  hometown: string | null;
  memberships: Array<{
    organizationId: string;
    organization: {
      type: import("@prisma/client").OrganizationType;
    };
    startDate: Date | null;
    endDate: Date | null;
    startYear: number | null;
    endYear: number | null;
  }>;
};

function buildPairKey(leftPersonId: string, rightPersonId: string) {
  return [leftPersonId, rightPersonId].sort().join(":");
}

function compareResults({
  leftRank,
  rightRank,
  leftMarkMillis,
  rightMarkMillis,
}: {
  leftRank: number | null;
  rightRank: number | null;
  leftMarkMillis: number | null;
  rightMarkMillis: number | null;
}) {
  let status: HeadToHeadComparisonStatus = "not_comparable";
  let rankDiff: number | null = null;
  let markDiffMillis: number | null = null;

  if (leftRank !== null && rightRank !== null) {
    rankDiff = leftRank - rightRank;
    if (leftRank < rightRank) {
      status = "left_ahead";
    } else if (leftRank > rightRank) {
      status = "right_ahead";
    } else {
      status = "tie";
    }

    return { status, rankDiff, markDiffMillis };
  }

  if (leftMarkMillis !== null && rightMarkMillis !== null) {
    markDiffMillis = leftMarkMillis - rightMarkMillis;
    if (leftMarkMillis < rightMarkMillis) {
      status = "left_ahead";
    } else if (leftMarkMillis > rightMarkMillis) {
      status = "right_ahead";
    } else {
      status = "tie";
    }
  }

  return { status, rankDiff, markDiffMillis };
}

function windowsOverlap(
  left: SharedContextInput["memberships"][number],
  right: SharedContextInput["memberships"][number],
) {
  const leftStart = left.startDate?.getUTCFullYear() ?? left.startYear;
  const leftEnd = left.endDate?.getUTCFullYear() ?? left.endYear ?? new Date().getUTCFullYear();
  const rightStart = right.startDate?.getUTCFullYear() ?? right.startYear;
  const rightEnd = right.endDate?.getUTCFullYear() ?? right.endYear ?? new Date().getUTCFullYear();

  if (leftStart === null || leftStart === undefined || rightStart === null || rightStart === undefined) {
    return left.organizationId === right.organizationId;
  }

  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function buildSharedContext(left: SharedContextInput, right: SharedContextInput): PlayerRelationContext {
  const sharedTeamStages = new Set<RelationStageKey>();
  const teamOverlapYears = {
    juniorHighSchool: 0,
    highSchool: 0,
    university: 0,
  };

  for (const leftMembership of left.memberships) {
    for (const rightMembership of right.memberships) {
      if (leftMembership.organizationId !== rightMembership.organizationId) {
        continue;
      }

      if (!windowsOverlap(leftMembership, rightMembership)) {
        continue;
      }

      const stage = getStageLabel(leftMembership.organization.type);
      if (stage) {
        sharedTeamStages.add(stage);
      }

      if (leftMembership.organization.type === "junior_high_school") {
        teamOverlapYears.juniorHighSchool = Math.max(teamOverlapYears.juniorHighSchool, countOverlapYears({
          organizationId: leftMembership.organizationId,
          organizationType: leftMembership.organization.type,
          startDate: leftMembership.startDate,
          endDate: leftMembership.endDate,
          startYear: leftMembership.startYear,
          endYear: leftMembership.endYear,
        }, {
          organizationId: rightMembership.organizationId,
          organizationType: rightMembership.organization.type,
          startDate: rightMembership.startDate,
          endDate: rightMembership.endDate,
          startYear: rightMembership.startYear,
          endYear: rightMembership.endYear,
        }));
      } else if (leftMembership.organization.type === "high_school") {
        teamOverlapYears.highSchool = Math.max(teamOverlapYears.highSchool, countOverlapYears({
          organizationId: leftMembership.organizationId,
          organizationType: leftMembership.organization.type,
          startDate: leftMembership.startDate,
          endDate: leftMembership.endDate,
          startYear: leftMembership.startYear,
          endYear: leftMembership.endYear,
        }, {
          organizationId: rightMembership.organizationId,
          organizationType: rightMembership.organization.type,
          startDate: rightMembership.startDate,
          endDate: rightMembership.endDate,
          startYear: rightMembership.startYear,
          endYear: rightMembership.endYear,
        }));
      } else if (leftMembership.organization.type === "university") {
        teamOverlapYears.university = Math.max(teamOverlapYears.university, countOverlapYears({
          organizationId: leftMembership.organizationId,
          organizationType: leftMembership.organization.type,
          startDate: leftMembership.startDate,
          endDate: leftMembership.endDate,
          startYear: leftMembership.startYear,
          endYear: leftMembership.endYear,
        }, {
          organizationId: rightMembership.organizationId,
          organizationType: rightMembership.organization.type,
          startDate: rightMembership.startDate,
          endDate: rightMembership.endDate,
          startYear: rightMembership.startYear,
          endYear: rightMembership.endYear,
        }));
      }
    }
  }

  const leftJuniorHighIds = new Set(
    left.memberships.filter((membership) => membership.organization.type === "junior_high_school").map((membership) => membership.organizationId),
  );
  const leftHighSchoolIds = new Set(
    left.memberships.filter((membership) => membership.organization.type === "high_school").map((membership) => membership.organizationId),
  );
  const leftUniversityIds = new Set(
    left.memberships.filter((membership) => membership.organization.type === "university").map((membership) => membership.organizationId),
  );
  const leftCorporateTeamIds = new Set(
    left.memberships.filter((membership) => membership.organization.type === "corporate_team").map((membership) => membership.organizationId),
  );
  const rightJuniorHighIds = new Set(
    right.memberships.filter((membership) => membership.organization.type === "junior_high_school").map((membership) => membership.organizationId),
  );
  const rightHighSchoolIds = new Set(
    right.memberships.filter((membership) => membership.organization.type === "high_school").map((membership) => membership.organizationId),
  );
  const rightUniversityIds = new Set(
    right.memberships.filter((membership) => membership.organization.type === "university").map((membership) => membership.organizationId),
  );
  const rightCorporateTeamIds = new Set(
    right.memberships.filter((membership) => membership.organization.type === "corporate_team").map((membership) => membership.organizationId),
  );
  const sameHometown = Boolean(left.hometown && right.hometown && left.hometown === right.hometown);
  const sharedJuniorHighSchool = [...leftJuniorHighIds].some((id) => rightJuniorHighIds.has(id));
  const sharedHighSchool = [...leftHighSchoolIds].some((id) => rightHighSchoolIds.has(id));
  const sharedUniversity = [...leftUniversityIds].some((id) => rightUniversityIds.has(id));
  const sharedCorporateTeam = [...leftCorporateTeamIds].some((id) => rightCorporateTeamIds.has(id));

  return {
    sameHometown,
    sharedOrigins: {
      juniorHighSchool: sharedJuniorHighSchool,
      highSchool: sharedHighSchool,
      university: sharedUniversity,
      corporateTeam: sharedCorporateTeam,
    },
    teamOverlapYears: {
      juniorHighSchool: teamOverlapYears.juniorHighSchool || undefined,
      highSchool: teamOverlapYears.highSchool || undefined,
      university: teamOverlapYears.university || undefined,
    },
    sharedTeamStages: [...sharedTeamStages],
    sharedHometown: sameHometown,
    sharedHighSchool,
    sharedUniversity,
  };
}

export async function buildPlayerHeadToHead(leftPersonId: string, rightPersonId: string): Promise<PlayerHeadToHeadPayload> {
  const pairKey = buildPairKey(leftPersonId, rightPersonId);
  const [leftPlayer, rightPlayer, leftResults, rightResults] = await Promise.all([
    prisma.person.findUniqueOrThrow({
      where: { id: leftPersonId },
      select: {
        hometown: true,
        memberships: {
          select: {
            organizationId: true,
            startDate: true,
            endDate: true,
            startYear: true,
            endYear: true,
            organization: {
              select: {
                type: true,
              },
            },
          },
        },
      },
    }),
    prisma.person.findUniqueOrThrow({
      where: { id: rightPersonId },
      select: {
        hometown: true,
        memberships: {
          select: {
            organizationId: true,
            startDate: true,
            endDate: true,
            startYear: true,
            endYear: true,
            organization: {
              select: {
                type: true,
              },
            },
          },
        },
      },
    }),
    prisma.raceResult.findMany({
      where: { personId: leftPersonId },
      select: {
        id: true,
        personId: true,
        raceId: true,
        rank: true,
        mark: true,
        markMillis: true,
        notes: true,
        organization: {
          select: {
            type: true,
          },
        },
        race: {
          select: {
            id: true,
            name: true,
            leg: true,
            startsAt: true,
            discipline: true,
            competitionEditionId: true,
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
    }),
    prisma.raceResult.findMany({
      where: { personId: rightPersonId },
      select: {
        id: true,
        personId: true,
        raceId: true,
        rank: true,
        mark: true,
        markMillis: true,
        notes: true,
      },
    }),
  ]);

  const rightResultsByRaceId = new Map(rightResults.map((result) => [result.raceId, result]));
  const matches: HeadToHeadMatch[] = [];

  for (const leftResult of leftResults) {
    const rightResult = rightResultsByRaceId.get(leftResult.raceId);

    if (!rightResult) {
      continue;
    }

    const stage = getStageLabel(leftResult.organization?.type);
    const comparison = compareResults({
      leftRank: leftResult.rank,
      rightRank: rightResult.rank,
      leftMarkMillis: leftResult.markMillis,
      rightMarkMillis: rightResult.markMillis,
    });

    matches.push({
      raceId: leftResult.raceId,
      raceResultLeftId: leftResult.id,
      raceResultRightId: rightResult.id,
      raceDate: (leftResult.race.startsAt ?? leftResult.race.competitionEdition.startsOn)?.toISOString() ?? null,
      competitionEditionId: leftResult.race.competitionEditionId,
      competitionName: leftResult.race.competitionEdition.officialName,
      raceName: leftResult.race.name,
      stage,
      discipline: leftResult.race.discipline,
      isEkiden:
        Boolean(leftResult.race.leg !== null) ||
        leftResult.race.competitionEdition.competition.type?.includes("ekiden") === true,
      left: {
        personId: leftPersonId,
        rank: leftResult.rank,
        mark: leftResult.mark,
        markMillis: leftResult.markMillis,
        notes: leftResult.notes,
      },
      right: {
        personId: rightPersonId,
        rank: rightResult.rank,
        mark: rightResult.mark,
        markMillis: rightResult.markMillis,
        notes: rightResult.notes,
      },
      comparison,
    });
  }

  matches.sort((left, right) => {
    const rightTime = Date.parse(right.raceDate ?? "") || 0;
    const leftTime = Date.parse(left.raceDate ?? "") || 0;

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return left.raceName.localeCompare(right.raceName);
  });

  const summary = {
    matchupCount: matches.length,
    leftAheadCount: matches.filter((match) => match.comparison.status === "left_ahead").length,
    rightAheadCount: matches.filter((match) => match.comparison.status === "right_ahead").length,
    tieCount: matches.filter((match) => match.comparison.status === "tie").length,
    comparableCount: matches.filter((match) => match.comparison.status !== "not_comparable").length,
    ekidenMatchupCount: matches.filter((match) => match.isEkiden).length,
    firstMatchAt: matches.at(-1)?.raceDate ?? null,
    latestMatchAt: matches[0]?.raceDate ?? null,
    stageCounts: {
      juniorHigh: matches.filter((match) => match.stage === "junior_high_school").length,
      highSchool: matches.filter((match) => match.stage === "high_school").length,
      university: matches.filter((match) => match.stage === "university").length,
      corporateTeam: matches.filter((match) => match.stage === "corporate_team").length,
    },
  };

  return {
    pairKey,
    leftPersonId,
    rightPersonId,
    generatedAt: new Date().toISOString(),
    summary,
    context: buildSharedContext(leftPlayer, rightPlayer),
    matches,
  };
}
