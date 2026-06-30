import { prisma } from "@/lib/prisma";
import { getMembershipOverlap } from "@/lib/membership";
import type { TeammateAggregate } from "@/lib/player-relations/types";

const SUPPORTED_ORGANIZATION_TYPES = ["high_school", "university", "corporate_team"] as const;

function getOverlapYears(
  first: { startYear: number | null; endYear: number | null },
  second: { startYear: number | null; endYear: number | null },
  fallbackYear: number,
) {
  if (!first.startYear || !second.startYear) {
    return 0;
  }

  const firstEnd = first.endYear ?? fallbackYear;
  const secondEnd = second.endYear ?? fallbackYear;
  const start = Math.max(first.startYear, second.startYear);
  const end = Math.min(firstEnd, secondEnd);

  return end > start ? end - start : 0;
}

export async function buildTeammateRelations(personId: string) {
  const memberships = await prisma.membership.findMany({
    where: {
      personId,
      organization: {
        type: { in: [...SUPPORTED_ORGANIZATION_TYPES] },
      },
    },
    select: {
      organizationId: true,
      startDate: true,
      endDate: true,
      startYear: true,
      endYear: true,
      organization: {
        select: {
          type: true,
          nameJa: true,
        },
      },
    },
  });

  if (memberships.length === 0) {
    return new Map<string, TeammateAggregate>();
  }

  const organizationIds = Array.from(new Set(memberships.map((membership) => membership.organizationId)));
  const teammateMemberships = await prisma.membership.findMany({
    where: {
      personId: { not: personId },
      organizationId: { in: organizationIds },
    },
    select: {
      personId: true,
      organizationId: true,
      startDate: true,
      endDate: true,
      startYear: true,
      endYear: true,
      organization: {
        select: {
          type: true,
          nameJa: true,
        },
      },
    },
  });

  const sharedEditions = await prisma.raceResult.findMany({
    where: {
      personId: { in: [personId, ...Array.from(new Set(teammateMemberships.map((item) => item.personId)))] },
      organizationId: { in: organizationIds },
    },
    select: {
      personId: true,
      organizationId: true,
      race: {
        select: {
          competitionEditionId: true,
          competitionEdition: {
            select: {
              shortName: true,
              officialName: true,
            },
          },
        },
      },
    },
  });

  const playerEditionsByOrg = new Map<string, Set<string>>();
  const teammateEditionsByPersonAndOrg = new Map<string, Set<string>>();

  for (const result of sharedEditions) {
    const editionLabel = result.race.competitionEdition.shortName ?? result.race.competitionEdition.officialName;
    const key = `${result.personId}:${result.organizationId ?? ""}`;

    if (result.personId === personId) {
      const existing = playerEditionsByOrg.get(result.organizationId ?? "") ?? new Set<string>();
      existing.add(editionLabel);
      playerEditionsByOrg.set(result.organizationId ?? "", existing);
      continue;
    }

    const existing = teammateEditionsByPersonAndOrg.get(key) ?? new Set<string>();
    existing.add(editionLabel);
    teammateEditionsByPersonAndOrg.set(key, existing);
  }

  const nowYear = new Date().getFullYear();
  const aggregates = new Map<string, TeammateAggregate>();

  for (const teammate of teammateMemberships) {
    const matchingMemberships = memberships.filter((membership) => membership.organizationId === teammate.organizationId);

    for (const ownMembership of matchingMemberships) {
      const overlap = getMembershipOverlap(ownMembership, teammate);

      if (overlap === "not_overlap") {
        continue;
      }

      const current = aggregates.get(teammate.personId) ?? {
        relatedPersonId: teammate.personId,
        overlapYears: 0,
        sharedEditionLabels: [],
        organizationTypes: new Set(),
      };

      current.organizationTypes.add(teammate.organization.type);

      if (overlap === "overlap") {
        current.overlapYears += getOverlapYears(ownMembership, teammate, nowYear);
      }

      const playerEditions = playerEditionsByOrg.get(teammate.organizationId) ?? new Set<string>();
      const teammateEditions = teammateEditionsByPersonAndOrg.get(`${teammate.personId}:${teammate.organizationId}`) ?? new Set<string>();

      for (const label of teammateEditions) {
        if (playerEditions.has(label) && !current.sharedEditionLabels.includes(label)) {
          current.sharedEditionLabels.push(label);
        }
      }

      aggregates.set(teammate.personId, current);
    }
  }

  return aggregates;
}
