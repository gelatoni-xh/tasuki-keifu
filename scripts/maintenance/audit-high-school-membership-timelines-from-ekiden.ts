import { MembershipType, OrganizationType } from "@prisma/client";

import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

function getAcademicYearEndYear(referenceDate: Date) {
  const month = referenceDate.getUTCMonth() + 1;
  const year = referenceDate.getUTCFullYear();
  return month >= 4 ? year + 1 : year;
}

function academicDatesForGrade(grade: number, referenceDate: Date) {
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
          competitionEdition: {
            include: {
              competition: true,
            },
          },
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

  const audited: Array<{
    personSlug: string;
    displayNameJa: string;
    raceCount: number;
    highSchoolNameJa: string | null;
    currentMembership: {
      organizationNameJa: string;
      startDate: string | null;
      endDate: string | null;
    } | null;
    expected: {
      startDate: string;
      endDate: string;
    } | null;
    status: "ok" | "mismatch" | "missing_membership" | "conflicting_expectations" | "different_school_membership";
    evidence: Array<{
      editionSlug: string;
      date: string | null;
      gradeAtRace: number | null;
      organizationNameJa: string | null;
      expectedStart: string | null;
      expectedEnd: string | null;
    }>;
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
      const dates = academicDatesForGrade(gradeAtRace, referenceDate);
      const key = keyForDates(dates.highSchoolStart, dates.highSchoolEnd);
      const existing = expectationKeys.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        expectationKeys.set(key, { ...dates, count: 1 });
      }
    }

    const evidence = personResults.map((result) => {
      const referenceDate =
        result.race.startsAt ??
        result.race.competitionEdition.startsOn ??
        new Date(`${result.race.competitionEdition.year}-01-01T00:00:00.000Z`);
      const dates = result.gradeAtRace ? academicDatesForGrade(result.gradeAtRace, referenceDate) : null;
      return {
        editionSlug: result.race.competitionEdition.slug,
        date: (result.race.startsAt ?? result.race.competitionEdition.startsOn)?.toISOString() ?? null,
        gradeAtRace: result.gradeAtRace,
        organizationNameJa: result.organization?.nameJa ?? null,
        expectedStart: dates?.highSchoolStart.toISOString() ?? null,
        expectedEnd: dates?.highSchoolEnd.toISOString() ?? null,
      };
    });

    const memberships = person.memberships;
    const primaryMembership = memberships[0] ?? null;
    const expectedEntries = [...expectationKeys.values()].sort((a, b) => b.count - a.count);
    const resultSchoolIds = new Set(
      personResults.map((result) => result.organizationId).filter((id): id is string => Boolean(id)),
    );

    if (expectedEntries.length === 0) {
      continue;
    }

    if (expectedEntries.length > 1) {
      audited.push({
        personSlug: person.slug,
        displayNameJa: person.displayNameJa,
        raceCount: personResults.length,
        highSchoolNameJa: primaryMembership?.organization.nameJa ?? null,
        currentMembership: primaryMembership
          ? {
              organizationNameJa: primaryMembership.organization.nameJa,
              startDate: primaryMembership.startDate?.toISOString() ?? null,
              endDate: primaryMembership.endDate?.toISOString() ?? null,
            }
          : null,
        expected: null,
        status: "conflicting_expectations",
        evidence,
      });
      continue;
    }

    const expected = expectedEntries[0]!;
    const expectedSchoolIds = resultSchoolIds;
    const hasMatchingSchoolMembership = memberships.some((membership) => expectedSchoolIds.has(membership.organizationId));
    const matchingMembership = memberships.find((membership) => expectedSchoolIds.has(membership.organizationId)) ?? null;

    let status: "ok" | "mismatch" | "missing_membership" | "different_school_membership" = "ok";

    if (!matchingMembership) {
      status = memberships.length === 0 ? "missing_membership" : "different_school_membership";
    } else {
      const sameStart = matchingMembership.startDate?.toISOString() === expected.highSchoolStart.toISOString();
      const sameEnd = matchingMembership.endDate?.toISOString() === expected.highSchoolEnd.toISOString();
      if (!sameStart || !sameEnd) {
        status = "mismatch";
      }
    }

    if (status === "mismatch" && resultSchoolIds.size > 1) {
      const allResultsCoveredByMemberships = personResults.every((result) => {
        const referenceDate =
          result.race.startsAt ??
          result.race.competitionEdition.startsOn ??
          new Date(`${result.race.competitionEdition.year}-01-01T00:00:00.000Z`);

        return memberships.some((membership) => {
          if (membership.organizationId !== result.organizationId) {
            return false;
          }

          const startsOk = !membership.startDate || membership.startDate.getTime() <= referenceDate.getTime();
          const endsOk = !membership.endDate || membership.endDate.getTime() >= referenceDate.getTime();
          return startsOk && endsOk;
        });
      });

      const coverageStart = memberships
        .map((membership) => membership.startDate?.getTime() ?? null)
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b)[0] ?? null;
      const coverageEnd = memberships
        .map((membership) => membership.endDate?.getTime() ?? null)
        .filter((value): value is number => value !== null)
        .sort((a, b) => b - a)[0] ?? null;

      const spansExpectedWindow =
        coverageStart === expected.highSchoolStart.getTime() &&
        coverageEnd === expected.highSchoolEnd.getTime();

      if (allResultsCoveredByMemberships && spansExpectedWindow) {
        status = "ok";
      }
    }

    audited.push({
      personSlug: person.slug,
      displayNameJa: person.displayNameJa,
      raceCount: personResults.length,
      highSchoolNameJa: matchingMembership?.organization.nameJa ?? primaryMembership?.organization.nameJa ?? null,
      currentMembership: matchingMembership
        ? {
            organizationNameJa: matchingMembership.organization.nameJa,
            startDate: matchingMembership.startDate?.toISOString() ?? null,
            endDate: matchingMembership.endDate?.toISOString() ?? null,
          }
        : primaryMembership
          ? {
              organizationNameJa: primaryMembership.organization.nameJa,
              startDate: primaryMembership.startDate?.toISOString() ?? null,
              endDate: primaryMembership.endDate?.toISOString() ?? null,
            }
          : null,
      expected: {
        startDate: expected.highSchoolStart.toISOString(),
        endDate: expected.highSchoolEnd.toISOString(),
      },
      status,
      evidence,
    });
  }

  const summary = {
    totalPeopleWithDerivableExpectation: audited.length,
    ok: audited.filter((row) => row.status === "ok").length,
    mismatch: audited.filter((row) => row.status === "mismatch").length,
    missingMembership: audited.filter((row) => row.status === "missing_membership").length,
    differentSchoolMembership: audited.filter((row) => row.status === "different_school_membership").length,
    conflictingExpectations: audited.filter((row) => row.status === "conflicting_expectations").length,
  };

  const byEdition = new Map<string, number>();
  for (const row of audited.filter((item) => item.status !== "ok")) {
    for (const item of row.evidence) {
      byEdition.set(item.editionSlug, (byEdition.get(item.editionSlug) ?? 0) + 1);
    }
  }

  const samples = audited
    .filter((row) => row.status !== "ok")
    .slice(0, 50);

  console.log(JSON.stringify({
    summary,
    affectedByEdition: [...byEdition.entries()]
      .map(([editionSlug, count]) => ({ editionSlug, count }))
      .sort((a, b) => b.count - a.count || a.editionSlug.localeCompare(b.editionSlug)),
    samples,
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
