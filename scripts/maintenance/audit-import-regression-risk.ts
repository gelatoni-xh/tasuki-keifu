import "dotenv/config";

import { type EventDiscipline, type OrganizationType } from "@prisma/client";

import { markToMilliseconds } from "../lib/import-utils";
import {
  chooseBestPayloadPersonalBestCandidate,
  loadPayloadPersonalBestCandidates,
  normalizeJaForPayloadKey,
} from "../lib/personal-best-payloads";
import { prisma } from "../lib/prisma";

type MembershipWithOrg = {
  id: string;
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

async function main() {
  const payloadCandidates = await loadPayloadPersonalBestCandidates();

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
      personalBests: {
        include: {
          source: true,
        },
      },
      raceResults: {
        where: {
          organization: {
            type: "university",
          },
        },
        include: {
          organization: true,
          race: {
            include: {
              competitionEdition: true,
            },
          },
        },
      },
    },
    orderBy: {
      displayNameJa: "asc",
    },
  });

  const report: Array<Record<string, unknown>> = [];

  for (const person of people) {
    const personKey = normalizeJaForPayloadKey(person.displayNameJa);
    const candidateMap = payloadCandidates.get(personKey);

    for (const pb of person.personalBests) {
      const currentMillis = pb.markMillis ?? markToMilliseconds(pb.mark);
      if (currentMillis === null || !candidateMap) {
        continue;
      }

      const candidates = candidateMap.get(pb.discipline);
      if (!candidates || candidates.length === 0) {
        continue;
      }

      const bestCandidate = chooseBestPayloadPersonalBestCandidate({ candidates });

      if (!bestCandidate) {
        continue;
      }

      if (
        pb.mark !== bestCandidate.mark ||
        pb.sourceId !== bestCandidate.sourceId ||
        pb.status === "conflicting"
      ) {
        report.push({
          category: "personal_best",
          personSlug: person.slug,
          displayNameJa: person.displayNameJa,
          discipline: pb.discipline,
          currentMark: pb.mark,
          currentStatus: pb.status,
          currentSource: pb.source?.id ?? null,
          candidateBestMark: bestCandidate.mark,
          candidateSource: bestCandidate.sourceId,
          candidateFrom: bestCandidate.label ?? null,
          deltaMs: currentMillis - bestCandidate.markMillis,
        });
      }
    }

    const memberships = person.memberships as MembershipWithOrg[];
    const highSchools = sortByStartDate(memberships.filter((item) => item.organization.type === "high_school"));
    const universities = sortByStartDate(memberships.filter((item) => item.organization.type === "university"));

    const latestHighSchool = highSchools.at(-1) ?? null;
    const earliestUniversity = universities[0] ?? null;

    if (
      latestHighSchool &&
      earliestUniversity &&
      latestHighSchool.startDate &&
      earliestUniversity.startDate &&
      latestHighSchool.startDate > earliestUniversity.startDate
    ) {
      report.push({
        category: "membership",
        issue: "high_school_starts_after_university",
        personSlug: person.slug,
        displayNameJa: person.displayNameJa,
        highSchool: latestHighSchool.organization.nameJa,
        university: earliestUniversity.organization.nameJa,
      });
    }

    for (const items of [highSchools, universities]) {
      for (let index = 0; index < items.length - 1; index += 1) {
        if (overlaps(items[index], items[index + 1])) {
          report.push({
            category: "membership",
            issue: "same_type_membership_overlap",
            personSlug: person.slug,
            displayNameJa: person.displayNameJa,
            first: items[index].organization.nameJa,
            second: items[index + 1].organization.nameJa,
            membershipType: items[index].organization.type,
          });
        }
      }
    }

    if (universities.length === 0) {
      const latestUniversityRace = person.raceResults.find((result) => result.organization && result.gradeAtRace);
      if (latestUniversityRace) {
        report.push({
          category: "membership",
          issue: "missing_university_membership_with_university_race_result",
          personSlug: person.slug,
          displayNameJa: person.displayNameJa,
          raceSlug: latestUniversityRace.race.slug,
          organizationNameJa: latestUniversityRace.organization?.nameJa ?? null,
          gradeAtRace: latestUniversityRace.gradeAtRace,
        });
      }
    }

    const missingProfileFields = [
      !person.displayNameRoman ? "displayNameRoman" : null,
      !person.displayNameKana ? "displayNameKana" : null,
      !person.birthDate ? "birthDate" : null,
      !person.hometown ? "hometown" : null,
      !person.nationality ? "nationality" : null,
    ].filter(Boolean);

    if (missingProfileFields.length > 0) {
      report.push({
        category: "person_profile",
        issue: "missing_profile_fields",
        personSlug: person.slug,
        displayNameJa: person.displayNameJa,
        missingFields: missingProfileFields,
      });
    }
  }

  console.log(JSON.stringify({
    checkedPeople: people.length,
    findings: report.length,
    report,
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
