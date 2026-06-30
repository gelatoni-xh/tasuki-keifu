import { OrganizationType, type MembershipType } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  buildOrganizationCanonicalKey,
  getOrganizationCanonicalScore,
} from "../lib/organization-normalization";

type OrganizationWithCounts = {
  id: string;
  slug: string;
  nameJa: string;
  shortName: string | null;
  type: OrganizationType;
  _count: {
    memberships: number;
    raceResults: number;
    teamCompetitionResults: number;
    sourceReferences: number;
  };
};

type MembershipWithRelations = {
  id: string;
  personId: string;
  type: MembershipType;
  startDate: Date | null;
  endDate: Date | null;
  startYear: number | null;
  endYear: number | null;
  organizationId: string;
  organization: {
    id: string;
    slug: string;
    nameJa: string;
    type: OrganizationType;
  };
  person: {
    slug: string;
    displayNameJa: string;
  };
};

function chooseCanonicalOrganization(organizations: OrganizationWithCounts[]) {
  return [...organizations].sort((left, right) => {
    const scoreDelta =
      getOrganizationCanonicalScore(right.nameJa, right.type) -
      getOrganizationCanonicalScore(left.nameJa, left.type);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const dependencyDelta =
      (right._count.memberships +
        right._count.raceResults +
        right._count.teamCompetitionResults +
        right._count.sourceReferences) -
      (left._count.memberships +
        left._count.raceResults +
        left._count.teamCompetitionResults +
        left._count.sourceReferences);

    if (dependencyDelta !== 0) {
      return dependencyDelta;
    }

    return left.nameJa.localeCompare(right.nameJa, "ja");
  })[0];
}

function periodSignature(membership: Pick<MembershipWithRelations, "type" | "startDate" | "endDate" | "startYear" | "endYear">) {
  return [
    membership.type,
    membership.startDate?.toISOString().slice(0, 10) ?? "",
    membership.endDate?.toISOString().slice(0, 10) ?? "",
    membership.startYear ?? "",
    membership.endYear ?? "",
  ].join("::");
}

function getRangeForOverlap(membership: Pick<MembershipWithRelations, "startDate" | "endDate" | "startYear" | "endYear">) {
  if (membership.startDate || membership.endDate) {
    if (!membership.startDate) {
      return null;
    }

    return {
      start: membership.startDate.getTime(),
      end: (membership.endDate ?? new Date("2100-12-31T00:00:00.000Z")).getTime(),
    };
  }

  if (membership.startYear) {
    return {
      start: membership.startYear,
      end: membership.endYear ?? 2100,
    };
  }

  return null;
}

function hasOverlappingPeriod(left: Pick<MembershipWithRelations, "startDate" | "endDate" | "startYear" | "endYear">, right: Pick<MembershipWithRelations, "startDate" | "endDate" | "startYear" | "endYear">) {
  const leftRange = getRangeForOverlap(left);
  const rightRange = getRangeForOverlap(right);

  if (!leftRange || !rightRange) {
    return false;
  }

  return leftRange.start <= rightRange.end && rightRange.start <= leftRange.end;
}

async function main() {
  const [organizations, memberships] = await Promise.all([
    prisma.organization.findMany({
      select: {
        id: true,
        slug: true,
        nameJa: true,
        shortName: true,
        type: true,
        _count: {
          select: {
            memberships: true,
            raceResults: true,
            teamCompetitionResults: true,
            sourceReferences: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { nameJa: "asc" }],
    }),
    prisma.membership.findMany({
      include: {
        organization: {
          select: {
            id: true,
            slug: true,
            nameJa: true,
            type: true,
          },
        },
        person: {
          select: {
            slug: true,
            displayNameJa: true,
          },
        },
      },
      orderBy: [{ personId: "asc" }, { startDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const candidateGroups = new Map<string, OrganizationWithCounts[]>();

  for (const organization of organizations) {
    if (!["high_school", "junior_high_school", "university"].includes(organization.type)) {
      continue;
    }

    const key = `${organization.type}::${buildOrganizationCanonicalKey(organization.nameJa, organization.type)}`;
    const existing = candidateGroups.get(key) ?? [];
    existing.push(organization);
    candidateGroups.set(key, existing);
  }

  const duplicateGroups = [...candidateGroups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => {
      const canonical = chooseCanonicalOrganization(items);
      const organizationIds = new Set(items.map((item) => item.id));
      const groupMemberships = memberships.filter((membership) => organizationIds.has(membership.organizationId));
      const uniquePeople = new Set(groupMemberships.map((membership) => membership.personId));
      const membershipsByPerson = new Map<string, MembershipWithRelations[]>();

      for (const membership of groupMemberships) {
        const existing = membershipsByPerson.get(membership.personId) ?? [];
        existing.push(membership);
        membershipsByPerson.set(membership.personId, existing);
      }

      const exactDuplicatePeople = [];
      const overlapPeople = [];

      for (const [personId, personMemberships] of membershipsByPerson) {
        const byPeriod = new Map<string, MembershipWithRelations[]>();

        for (const membership of personMemberships) {
          const periodKey = `${membership.organization.type}::${periodSignature(membership)}`;
          const existing = byPeriod.get(periodKey) ?? [];
          existing.push(membership);
          byPeriod.set(periodKey, existing);
        }

        for (const [, duplicates] of byPeriod) {
          if (duplicates.length > 1) {
            exactDuplicatePeople.push({
              personId,
              personSlug: duplicates[0]?.person.slug ?? "",
              displayNameJa: duplicates[0]?.person.displayNameJa ?? "",
              memberships: duplicates.map((membership) => ({
                id: membership.id,
                organizationSlug: membership.organization.slug,
                organizationNameJa: membership.organization.nameJa,
                type: membership.type,
                startDate: membership.startDate?.toISOString().slice(0, 10) ?? null,
                endDate: membership.endDate?.toISOString().slice(0, 10) ?? null,
                startYear: membership.startYear,
                endYear: membership.endYear,
              })),
            });
          }
        }

        const sortedMemberships = [...personMemberships].sort((left, right) => {
          const leftTime = left.startDate?.getTime() ?? 0;
          const rightTime = right.startDate?.getTime() ?? 0;
          return leftTime - rightTime;
        });

        for (let index = 0; index < sortedMemberships.length - 1; index += 1) {
          for (let nextIndex = index + 1; nextIndex < sortedMemberships.length; nextIndex += 1) {
            const current = sortedMemberships[index];
            const next = sortedMemberships[nextIndex];

            if (current.organizationId === next.organizationId) {
              continue;
            }

            if (current.type !== next.type) {
              continue;
            }

            if (!hasOverlappingPeriod(current, next)) {
              continue;
            }

            overlapPeople.push({
              personId,
              personSlug: current.person.slug,
              displayNameJa: current.person.displayNameJa,
              first: {
                id: current.id,
                organizationSlug: current.organization.slug,
                organizationNameJa: current.organization.nameJa,
                type: current.type,
                startDate: current.startDate?.toISOString().slice(0, 10) ?? null,
                endDate: current.endDate?.toISOString().slice(0, 10) ?? null,
                startYear: current.startYear,
                endYear: current.endYear,
              },
              second: {
                id: next.id,
                organizationSlug: next.organization.slug,
                organizationNameJa: next.organization.nameJa,
                type: next.type,
                startDate: next.startDate?.toISOString().slice(0, 10) ?? null,
                endDate: next.endDate?.toISOString().slice(0, 10) ?? null,
                startYear: next.startYear,
                endYear: next.endYear,
              },
            });
          }
        }
      }

      return {
        key,
        organizationType: canonical.type,
        canonicalKey: key.split("::")[1] ?? "",
        recommendedCanonical: {
          id: canonical.id,
          slug: canonical.slug,
          nameJa: canonical.nameJa,
        },
        organizations: items.map((item) => ({
          id: item.id,
          slug: item.slug,
          nameJa: item.nameJa,
          shortName: item.shortName,
          membershipCount: item._count.memberships,
          raceResultCount: item._count.raceResults,
          teamCompetitionResultCount: item._count.teamCompetitionResults,
          sourceReferenceCount: item._count.sourceReferences,
          canonicalScore: getOrganizationCanonicalScore(item.nameJa, item.type),
        })),
        impactedMembershipCount: groupMemberships.length,
        impactedPeopleCount: uniquePeople.size,
        exactDuplicateMembershipPeopleCount: exactDuplicatePeople.length,
        overlappingMembershipPeopleCount: overlapPeople.length,
        exactDuplicateMembershipPeopleSample: exactDuplicatePeople.slice(0, 10),
        overlappingMembershipPeopleSample: overlapPeople.slice(0, 10),
      };
    })
    .sort((left, right) => {
      if (right.impactedPeopleCount !== left.impactedPeopleCount) {
        return right.impactedPeopleCount - left.impactedPeopleCount;
      }

      if (right.impactedMembershipCount !== left.impactedMembershipCount) {
        return right.impactedMembershipCount - left.impactedMembershipCount;
      }

      return left.canonicalKey.localeCompare(right.canonicalKey, "ja");
    });

  const summary = {
    generatedAt: new Date().toISOString(),
    totals: {
      organizations: organizations.length,
      memberships: memberships.length,
      candidateDuplicateGroups: duplicateGroups.length,
      candidateDuplicateOrganizations: duplicateGroups.reduce((sum, group) => sum + group.organizations.length, 0),
      impactedMemberships: duplicateGroups.reduce((sum, group) => sum + group.impactedMembershipCount, 0),
      impactedPeople: new Set(
        duplicateGroups.flatMap((group) => [
          ...group.exactDuplicateMembershipPeopleSample.map((item) => item.personSlug),
          ...group.overlappingMembershipPeopleSample.map((item) => item.personSlug),
        ]),
      ).size,
      exactDuplicateMembershipPeople: duplicateGroups.reduce(
        (sum, group) => sum + group.exactDuplicateMembershipPeopleCount,
        0,
      ),
      overlappingMembershipPeople: duplicateGroups.reduce(
        (sum, group) => sum + group.overlappingMembershipPeopleCount,
        0,
      ),
    },
    duplicateGroupsByType: duplicateGroups.reduce<Record<string, number>>((accumulator, group) => {
      accumulator[group.organizationType] = (accumulator[group.organizationType] ?? 0) + 1;
      return accumulator;
    }, {}),
    topGroups: duplicateGroups.slice(0, 50),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
