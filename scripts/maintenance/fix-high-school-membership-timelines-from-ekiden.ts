import { MembershipType, OrganizationType } from "@prisma/client";

import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

function getAcademicYearEndYear(referenceDate: Date) {
  const month = referenceDate.getUTCMonth() + 1;
  const year = referenceDate.getUTCFullYear();
  return month >= 4 ? year + 1 : year;
}

function academicDatesForHighSchoolGrade(grade: number, referenceDate: Date) {
  const academicYearEndYear = getAcademicYearEndYear(referenceDate);
  const highSchoolEndYear = academicYearEndYear + (3 - grade);

  return {
    highSchoolStart: new Date(`${highSchoolEndYear - 3}-04-01T00:00:00.000Z`),
    highSchoolEnd: new Date(`${highSchoolEndYear}-03-31T00:00:00.000Z`),
  };
}

function keyForDates(startDate: Date, endDate: Date) {
  return `${startDate.toISOString()}__${endDate.toISOString()}`;
}

async function main() {
  const results = await prisma.raceResult.findMany({
    where: {
      gradeAtRace: { not: null },
      organization: { type: OrganizationType.high_school },
      race: {
        competitionEdition: {
          competition: {
            slug: "national-high-school-ekiden",
          },
        },
      },
    },
    include: {
      person: {
        include: {
          memberships: {
            where: {
              type: MembershipType.enrolled,
              organization: { type: OrganizationType.high_school },
            },
            include: {
              organization: true,
            },
            orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
          },
        },
      },
      organization: true,
      race: {
        include: {
          competitionEdition: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const byPerson = new Map<string, typeof results>();
  for (const result of results) {
    const group = byPerson.get(result.personId) ?? [];
    group.push(result);
    byPerson.set(result.personId, group);
  }

  let updatedCount = 0;
  let skippedConflictCount = 0;
  let skippedNoMembershipCount = 0;
  let skippedAlreadyCorrectCount = 0;
  const updatedSamples: Array<{
    personSlug: string;
    displayNameJa: string;
    schoolNameJa: string;
    from: { startDate: string | null; endDate: string | null };
    to: { startDate: string; endDate: string };
    editions: string[];
  }> = [];

  for (const personResults of byPerson.values()) {
    const person = personResults[0]!.person;
    const expectationKeys = new Map<string, { startDate: Date; endDate: Date; count: number }>();

    for (const result of personResults) {
      const referenceDate =
        result.race.startsAt ??
        result.race.competitionEdition.startsOn ??
        new Date(`${result.race.competitionEdition.year}-01-01T00:00:00.000Z`);
      const gradeAtRace = result.gradeAtRace;
      if (!gradeAtRace) continue;
      const dates = academicDatesForHighSchoolGrade(gradeAtRace, referenceDate);
      const key = keyForDates(dates.highSchoolStart, dates.highSchoolEnd);
      const existing = expectationKeys.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        expectationKeys.set(key, { ...dates, count: 1 });
      }
    }

    const expectedEntries = [...expectationKeys.values()].sort((a, b) => b.count - a.count);
    if (expectedEntries.length !== 1) {
      skippedConflictCount += 1;
      continue;
    }

    const expected = expectedEntries[0]!;
    const expectedSchoolIds = new Set(
      personResults.map((result) => result.organizationId).filter((id): id is string => Boolean(id)),
    );
    const matchingMembership = person.memberships.find((membership) => expectedSchoolIds.has(membership.organizationId)) ?? null;

    if (!matchingMembership) {
      skippedNoMembershipCount += 1;
      continue;
    }

    const sameTimeline =
      matchingMembership.startDate?.toISOString() === expected.highSchoolStart.toISOString() &&
      matchingMembership.endDate?.toISOString() === expected.highSchoolEnd.toISOString();

    if (sameTimeline) {
      skippedAlreadyCorrectCount += 1;
      continue;
    }

    await prisma.membership.update({
      where: { id: matchingMembership.id },
      data: {
        startDate: expected.highSchoolStart,
        endDate: expected.highSchoolEnd,
        startYear: expected.highSchoolStart.getUTCFullYear(),
        endYear: expected.highSchoolEnd.getUTCFullYear(),
        sourceId: personResults[personResults.length - 1]!.sourceId,
      },
    });

    updatedCount += 1;
    if (updatedSamples.length < 20) {
      updatedSamples.push({
        personSlug: person.slug,
        displayNameJa: person.displayNameJa,
        schoolNameJa: matchingMembership.organization.nameJa,
        from: {
          startDate: matchingMembership.startDate?.toISOString() ?? null,
          endDate: matchingMembership.endDate?.toISOString() ?? null,
        },
        to: {
          startDate: expected.highSchoolStart.toISOString(),
          endDate: expected.highSchoolEnd.toISOString(),
        },
        editions: [...new Set(personResults.map((result) => result.race.competitionEdition.slug))].sort(),
      });
    }
  }

  console.log(JSON.stringify({
    updatedCount,
    skippedConflictCount,
    skippedNoMembershipCount,
    skippedAlreadyCorrectCount,
    updatedSamples,
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
