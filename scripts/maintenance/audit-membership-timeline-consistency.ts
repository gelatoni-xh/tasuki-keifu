import "dotenv/config";

import { MembershipType, OrganizationType } from "@prisma/client";

import { prisma } from "../lib/prisma";

type MembershipWithOrg = {
  id: string;
  type: MembershipType;
  startDate: Date | null;
  endDate: Date | null;
  startYear: number | null;
  endYear: number | null;
  organization: {
    slug: string;
    nameJa: string;
    type: OrganizationType;
  };
};

function sortByStartDate(memberships: MembershipWithOrg[]) {
  return [...memberships].sort((a, b) => {
    const aTime = a.startDate?.getTime() ?? 0;
    const bTime = b.startDate?.getTime() ?? 0;
    return aTime - bTime;
  });
}

function overlaps(first: MembershipWithOrg, second: MembershipWithOrg, now = new Date()) {
  const firstStart = first.startDate;
  const secondStart = second.startDate;

  if (!firstStart || !secondStart) {
    return false;
  }

  const firstEnd = first.endDate ?? now;
  const secondEnd = second.endDate ?? now;
  return firstStart <= secondEnd && secondStart <= firstEnd;
}

function isCurrent(membership: MembershipWithOrg, now = new Date()) {
  const startsBeforeNow = !membership.startDate || membership.startDate <= now;
  const hasNotEnded = !membership.endDate || membership.endDate >= now;
  return startsBeforeNow && hasNotEnded;
}

async function main() {
  const people = await prisma.person.findMany({
    where: {
      type: "athlete",
    },
    include: {
      memberships: {
        include: {
          organization: true,
        },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      },
      raceResults: {
        where: {
          organization: {
            type: "university",
          },
        },
        include: {
          race: {
            include: {
              competitionEdition: true,
            },
          },
          organization: true,
        },
        orderBy: [{ race: { competitionEdition: { year: "desc" } } }, { createdAt: "desc" }],
      },
    },
    orderBy: {
      displayNameJa: "asc",
    },
  });

  const findings: Array<Record<string, unknown>> = [];

  for (const person of people) {
    const memberships = person.memberships as MembershipWithOrg[];
    const highSchools = sortByStartDate(memberships.filter((item) => item.organization.type === "high_school"));
    const universities = sortByStartDate(memberships.filter((item) => item.organization.type === "university"));
    const currentMemberships = memberships.filter((item) => isCurrent(item));

    if (currentMemberships.length > 1) {
      findings.push({
        personSlug: person.slug,
        displayNameJa: person.displayNameJa,
        issue: "multiple_current_memberships",
        memberships: currentMemberships.map((item) => ({
          organizationSlug: item.organization.slug,
          organizationNameJa: item.organization.nameJa,
          type: item.organization.type,
          startDate: item.startDate?.toISOString().slice(0, 10) ?? null,
          endDate: item.endDate?.toISOString().slice(0, 10) ?? null,
        })),
      });
    }

    const latestHighSchool = highSchools.at(-1) ?? null;
    const earliestUniversity = universities[0] ?? null;

    if (latestHighSchool && earliestUniversity) {
      if (
        latestHighSchool.startDate &&
        earliestUniversity.startDate &&
        latestHighSchool.startDate > earliestUniversity.startDate
      ) {
        findings.push({
          personSlug: person.slug,
          displayNameJa: person.displayNameJa,
          issue: "high_school_starts_after_university",
          highSchool: {
            organizationSlug: latestHighSchool.organization.slug,
            organizationNameJa: latestHighSchool.organization.nameJa,
            startDate: latestHighSchool.startDate.toISOString().slice(0, 10),
            endDate: latestHighSchool.endDate?.toISOString().slice(0, 10) ?? null,
          },
          university: {
            organizationSlug: earliestUniversity.organization.slug,
            organizationNameJa: earliestUniversity.organization.nameJa,
            startDate: earliestUniversity.startDate.toISOString().slice(0, 10),
            endDate: earliestUniversity.endDate?.toISOString().slice(0, 10) ?? null,
          },
        });
      }

      if (
        latestHighSchool.endDate &&
        earliestUniversity.endDate &&
        latestHighSchool.endDate > earliestUniversity.endDate
      ) {
        findings.push({
          personSlug: person.slug,
          displayNameJa: person.displayNameJa,
          issue: "high_school_ends_after_university",
          highSchool: {
            organizationSlug: latestHighSchool.organization.slug,
            organizationNameJa: latestHighSchool.organization.nameJa,
            endDate: latestHighSchool.endDate.toISOString().slice(0, 10),
          },
          university: {
            organizationSlug: earliestUniversity.organization.slug,
            organizationNameJa: earliestUniversity.organization.nameJa,
            endDate: earliestUniversity.endDate.toISOString().slice(0, 10) ?? null,
          },
        });
      }
    }

    for (const items of [highSchools, universities]) {
      for (let index = 0; index < items.length - 1; index += 1) {
        const current = items[index];
        const next = items[index + 1];
        if (overlaps(current, next)) {
          findings.push({
            personSlug: person.slug,
            displayNameJa: person.displayNameJa,
            issue: "same_type_membership_overlap",
            first: {
              organizationSlug: current.organization.slug,
              organizationNameJa: current.organization.nameJa,
              type: current.organization.type,
              startDate: current.startDate?.toISOString().slice(0, 10) ?? null,
              endDate: current.endDate?.toISOString().slice(0, 10) ?? null,
            },
            second: {
              organizationSlug: next.organization.slug,
              organizationNameJa: next.organization.nameJa,
              type: next.organization.type,
              startDate: next.startDate?.toISOString().slice(0, 10) ?? null,
              endDate: next.endDate?.toISOString().slice(0, 10) ?? null,
            },
          });
        }
      }
    }

    if (universities.length === 0) {
      const latestUniversityRace = person.raceResults.find((result) => result.gradeAtRace && result.organization);
      if (latestUniversityRace) {
        findings.push({
          personSlug: person.slug,
          displayNameJa: person.displayNameJa,
          issue: "missing_university_membership_with_university_race_result",
          raceSlug: latestUniversityRace.race.slug,
          organizationSlug: latestUniversityRace.organization?.slug ?? null,
          organizationNameJa: latestUniversityRace.organization?.nameJa ?? null,
          gradeAtRace: latestUniversityRace.gradeAtRace,
        });
      }
    }
  }

  console.log(JSON.stringify({
    checkedPeople: people.length,
    findings: findings.length,
    report: findings,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
