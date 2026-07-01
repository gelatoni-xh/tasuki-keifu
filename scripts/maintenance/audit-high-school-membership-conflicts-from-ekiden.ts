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

  const conflicts: Array<{
    personSlug: string;
    displayNameJa: string;
    raceCount: number;
    resultSchoolCount: number;
    membershipSchoolCount: number;
    expectedTimelineCount: number;
    schoolsInResults: string[];
    schoolsInMemberships: string[];
    expectedTimelines: Array<{ startDate: string; endDate: string; count: number }>;
    evidence: Array<{
      editionSlug: string;
      gradeAtRace: number | null;
      organizationNameJa: string | null;
      expectedStart: string | null;
      expectedEnd: string | null;
    }>;
  }> = [];

  for (const personResults of byPerson.values()) {
    const expectationKeys = new Map<string, { highSchoolStart: Date; highSchoolEnd: Date; count: number }>();

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
    if (expectedEntries.length <= 1) {
      continue;
    }

    const person = personResults[0]!.person;
    const resultSchools = [...new Set(
      personResults
        .map((result) => result.organization?.nameJa)
        .filter((value): value is string => Boolean(value)),
    )].sort();
    const membershipSchools = [...new Set(person.memberships.map((membership) => membership.organization.nameJa))].sort();

    conflicts.push({
      personSlug: person.slug,
      displayNameJa: person.displayNameJa,
      raceCount: personResults.length,
      resultSchoolCount: resultSchools.length,
      membershipSchoolCount: membershipSchools.length,
      expectedTimelineCount: expectedEntries.length,
      schoolsInResults: resultSchools,
      schoolsInMemberships: membershipSchools,
      expectedTimelines: expectedEntries.map((entry) => ({
        startDate: entry.highSchoolStart.toISOString(),
        endDate: entry.highSchoolEnd.toISOString(),
        count: entry.count,
      })),
      evidence: personResults.map((result) => {
        const referenceDate =
          result.race.startsAt ??
          result.race.competitionEdition.startsOn ??
          new Date(`${result.race.competitionEdition.year}-01-01T00:00:00.000Z`);
        const dates = result.gradeAtRace ? academicDatesForHighSchoolGrade(result.gradeAtRace, referenceDate) : null;

        return {
          editionSlug: result.race.competitionEdition.slug,
          gradeAtRace: result.gradeAtRace,
          organizationNameJa: result.organization?.nameJa ?? null,
          expectedStart: dates?.highSchoolStart.toISOString() ?? null,
          expectedEnd: dates?.highSchoolEnd.toISOString() ?? null,
        };
      }),
    });
  }

  const raceCountBuckets = new Map<string, number>();
  const resultSchoolBuckets = new Map<string, number>();
  const timelineBuckets = new Map<string, number>();
  const patternBuckets = new Map<string, number>();

  for (const row of conflicts) {
    raceCountBuckets.set(String(row.raceCount), (raceCountBuckets.get(String(row.raceCount)) ?? 0) + 1);
    resultSchoolBuckets.set(String(row.resultSchoolCount), (resultSchoolBuckets.get(String(row.resultSchoolCount)) ?? 0) + 1);
    timelineBuckets.set(String(row.expectedTimelineCount), (timelineBuckets.get(String(row.expectedTimelineCount)) ?? 0) + 1);

    const key = [
      `races=${row.raceCount}`,
      `resultSchools=${row.resultSchoolCount}`,
      `membershipSchools=${row.membershipSchoolCount}`,
      `timelines=${row.expectedTimelineCount}`,
    ].join(" | ");
    patternBuckets.set(key, (patternBuckets.get(key) ?? 0) + 1);
  }

  console.log(JSON.stringify({
    summary: {
      totalConflicts: conflicts.length,
      raceCountBuckets: [...raceCountBuckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
      resultSchoolBuckets: [...resultSchoolBuckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
      timelineBuckets: [...timelineBuckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
      topPatterns: [...patternBuckets.entries()]
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
        .slice(0, 20),
    },
    samples: conflicts.slice(0, 60),
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
