import { prisma } from "@/lib/prisma";
import { getStageLabel, windowsOverlap } from "@/lib/player-relations/relation-helpers";
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
  const baseHighSchoolIds = new Set(
    baseWindows.filter((window) => window.organizationType === "high_school").map((window) => window.organizationId),
  );
  const baseUniversityIds = new Set(
    baseWindows.filter((window) => window.organizationType === "university").map((window) => window.organizationId),
  );

  const aggregates = new Map<string, PlayerRelationContextAggregate>();

  for (const related of relatedPeople) {
    const relatedWindows = buildMembershipWindows(related.memberships);
    const sharedTeamStages = new Set<PlayerRelationContextAggregate["sharedTeamStages"] extends Set<infer T> ? T : never>();

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
      }
    }

    const relatedHighSchoolIds = new Set(
      relatedWindows.filter((window) => window.organizationType === "high_school").map((window) => window.organizationId),
    );
    const relatedUniversityIds = new Set(
      relatedWindows.filter((window) => window.organizationType === "university").map((window) => window.organizationId),
    );

    const sharedHighSchool = [...baseHighSchoolIds].some((id) => relatedHighSchoolIds.has(id));
    const sharedUniversity = [...baseUniversityIds].some((id) => relatedUniversityIds.has(id));

    aggregates.set(related.id, {
      relatedPersonId: related.id,
      sharedTeamStages,
      sharedHometown: Boolean(basePerson?.hometown && related.hometown && basePerson.hometown === related.hometown),
      sharedHighSchool,
      sharedUniversity,
    });
  }

  return aggregates;
}
