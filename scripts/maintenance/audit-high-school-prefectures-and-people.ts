import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

async function main() {
  const missingPrefectureSchools = await prisma.organization.findMany({
    where: {
      type: "high_school",
      prefecture: null,
    },
    include: {
      _count: {
        select: {
          raceResults: true,
          memberships: true,
          teamCompetitionResults: true,
        },
      },
      nameVariants: {
        select: {
          value: true,
        },
      },
    },
    orderBy: [
      { raceResults: { _count: "desc" } },
      { memberships: { _count: "desc" } },
      { nameJa: "asc" },
    ],
  });

  const duplicatePeople = await prisma.person.groupBy({
    by: ["displayNameJa"],
    _count: {
      _all: true,
    },
    having: {
      displayNameJa: {
        _count: {
          gt: 1,
        },
      },
    },
    orderBy: {
      _count: {
        displayNameJa: "desc",
      },
    },
  });

  const duplicatePeopleDetails = [];
  for (const item of duplicatePeople.slice(0, 100)) {
    const people = await prisma.person.findMany({
      where: {
        displayNameJa: item.displayNameJa,
      },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
        raceResults: {
          include: {
            organization: true,
            race: true,
          },
        },
      },
      orderBy: {
        slug: "asc",
      },
    });

    duplicatePeopleDetails.push({
      displayNameJa: item.displayNameJa,
      count: item._count._all,
      people: people.map((person) => ({
        slug: person.slug,
        memberships: person.memberships
          .filter((membership) => membership.organization.type === "high_school")
          .map((membership) => membership.organization.nameJa),
        raceOrganizations: [...new Set(
          person.raceResults
            .filter((raceResult) => raceResult.organization?.type === "high_school")
            .map((raceResult) => raceResult.organization?.nameJa)
            .filter(Boolean),
        )],
      })),
    });
  }

  console.log(JSON.stringify({
    missingPrefectureSchools: missingPrefectureSchools.map((school) => ({
      slug: school.slug,
      nameJa: school.nameJa,
      aliases: school.nameVariants.map((variant) => variant.value),
      raceResults: school._count.raceResults,
      memberships: school._count.memberships,
      teamCompetitionResults: school._count.teamCompetitionResults,
    })),
    duplicatePeopleDetails,
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
