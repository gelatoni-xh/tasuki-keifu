import { MembershipType, OrganizationType } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { ensureMembership } from "../lib/import-utils";

const TARGET_COMPETITION_SLUGS = [
  "all-japan-university-ekiden",
  "national-high-school-ekiden",
] as const;

async function main() {
  const raceResults = await prisma.raceResult.findMany({
    where: {
      organization: {
        type: {
          in: [OrganizationType.university, OrganizationType.high_school],
        },
      },
      race: {
        competitionEdition: {
          competition: {
            slug: {
              in: [...TARGET_COMPETITION_SLUGS],
            },
          },
        },
      },
    },
    include: {
      organization: true,
      person: true,
      source: true,
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
    orderBy: [
      { race: { competitionEdition: { startsOn: "desc" } } },
      { createdAt: "desc" },
    ],
  });

  const seenKeys = new Set<string>();
  const repaired: Array<{
    personSlug: string;
    organizationSlug: string;
    competitionSlug: string;
    editionSlug: string;
    sourceId: string | null;
  }> = [];

  for (const result of raceResults) {
    if (!result.organization) {
      continue;
    }

    const key = `${result.personId}:${result.organizationId}`;
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    const existingMembership = await prisma.membership.findFirst({
      where: {
        personId: result.personId,
        organizationId: result.organizationId,
        type: MembershipType.enrolled,
      },
      select: {
        id: true,
      },
    });

    if (existingMembership) {
      continue;
    }

    await ensureMembership(prisma, {
      personId: result.personId,
      organizationId: result.organizationId,
      type: MembershipType.enrolled,
      startDate: null,
      endDate: null,
      startYear: null,
      endYear: null,
      sourceId: result.sourceId ?? "seed-manual",
    });

    repaired.push({
      personSlug: result.person.slug,
      organizationSlug: result.organization.slug,
      competitionSlug: result.race.competitionEdition.competition.slug,
      editionSlug: result.race.competitionEdition.slug,
      sourceId: result.sourceId,
    });
  }

  console.log(JSON.stringify({
    targetCompetitions: TARGET_COMPETITION_SLUGS,
    repairedCount: repaired.length,
    repaired,
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
