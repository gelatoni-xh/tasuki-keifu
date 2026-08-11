import { prisma } from "@/lib/prisma";
import { countOverlapYears, getStageLabel, windowsOverlap } from "@/lib/player-relations/relation-helpers";
import type { MembershipWindow, PlayerRelationContextAggregate } from "@/lib/player-relations/types";

function buildMembershipWindows(
  memberships: Array<{
    organizationId: string;
    organization: { type: import("@prisma/client").OrganizationType };
    startDate: Date | null;
    endDate: Date | null;
    startYear: number | null;
    endYear: number | null;
  }>,
): MembershipWindow[] {
  return memberships.map((membership) => ({
    organizationId: membership.organizationId,
    organizationType: membership.organization.type,
    startDate: membership.startDate,
    endDate: membership.endDate,
    startYear: membership.startYear,
    endYear: membership.endYear,
  }));
}

export async function buildRelationContext(personId: string, relatedPersonIds: string[]) {
  if (relatedPersonIds.length === 0) {
    return new Map<string, PlayerRelationContextAggregate>();
  }

  const [basePerson, relatedPeople] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
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
    prisma.person.findMany({
      where: {
        id: { in: relatedPersonIds },
      },
      select: {
        id: true,
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
                id: true,
                type: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const baseWindows = buildMembershipWindows(basePerson?.memberships ?? []);
  const baseIdsByType = {
    junior_high_school: new Set(
      baseWindows.filter((window) => window.organizationType === "junior_high_school").map((window) => window.organizationId),
    ),
    high_school: new Set(
      baseWindows.filter((window) => window.organizationType === "high_school").map((window) => window.organizationId),
    ),
    university: new Set(
      baseWindows.filter((window) => window.organizationType === "university").map((window) => window.organizationId),
    ),
    corporate_team: new Set(
      baseWindows.filter((window) => window.organizationType === "corporate_team").map((window) => window.organizationId),
    ),
  };

  const aggregates = new Map<string, PlayerRelationContextAggregate>();

  for (const related of relatedPeople) {
    const relatedWindows = buildMembershipWindows(related.memberships);
    const sharedTeamStages = new Set<PlayerRelationContextAggregate["sharedTeamStages"] extends Set<infer T> ? T : never>();
    const sharedOrigins = {
      juniorHighSchool: false,
      highSchool: false,
      university: false,
      corporateTeam: false,
    };
    const teamOverlapYears = {
      juniorHighSchool: 0,
      highSchool: 0,
      university: 0,
    };

    for (const left of baseWindows) {
      for (const right of relatedWindows) {
        if (left.organizationId !== right.organizationId) {
          continue;
        }

        if (!windowsOverlap(left, right)) {
          continue;
        }

        const stage = getStageLabel(left.organizationType);

        if (stage) {
          sharedTeamStages.add(stage);
        }

        if (left.organizationType === "junior_high_school") {
          teamOverlapYears.juniorHighSchool = Math.max(teamOverlapYears.juniorHighSchool, countOverlapYears(left, right));
        } else if (left.organizationType === "high_school") {
          teamOverlapYears.highSchool = Math.max(teamOverlapYears.highSchool, countOverlapYears(left, right));
        } else if (left.organizationType === "university") {
          teamOverlapYears.university = Math.max(teamOverlapYears.university, countOverlapYears(left, right));
        }
      }
    }

    const relatedIdsByType = {
      junior_high_school: new Set(
        relatedWindows.filter((window) => window.organizationType === "junior_high_school").map((window) => window.organizationId),
      ),
      high_school: new Set(
        relatedWindows.filter((window) => window.organizationType === "high_school").map((window) => window.organizationId),
      ),
      university: new Set(
        relatedWindows.filter((window) => window.organizationType === "university").map((window) => window.organizationId),
      ),
      corporate_team: new Set(
        relatedWindows.filter((window) => window.organizationType === "corporate_team").map((window) => window.organizationId),
      ),
    };

    const sameHometown = Boolean(basePerson?.hometown && related.hometown && basePerson.hometown === related.hometown);
    const sharedJuniorHighSchool = [...baseIdsByType.junior_high_school].some((id) => relatedIdsByType.junior_high_school.has(id));
    const sharedHighSchool = [...baseIdsByType.high_school].some((id) => relatedIdsByType.high_school.has(id));
    const sharedUniversity = [...baseIdsByType.university].some((id) => relatedIdsByType.university.has(id));
    const sharedCorporateTeam = [...baseIdsByType.corporate_team].some((id) => relatedIdsByType.corporate_team.has(id));

    sharedOrigins.juniorHighSchool = sharedJuniorHighSchool;
    sharedOrigins.highSchool = sharedHighSchool;
    sharedOrigins.university = sharedUniversity;
    sharedOrigins.corporateTeam = sharedCorporateTeam;

    aggregates.set(related.id, {
      relatedPersonId: related.id,
      sameHometown,
      sharedOrigins,
      teamOverlapYears: {
        juniorHighSchool: teamOverlapYears.juniorHighSchool || undefined,
        highSchool: teamOverlapYears.highSchool || undefined,
        university: teamOverlapYears.university || undefined,
      },
      sharedTeamStages,
      sharedHometown: sameHometown,
      sharedHighSchool,
      sharedUniversity,
    });
  }

  return aggregates;
}
