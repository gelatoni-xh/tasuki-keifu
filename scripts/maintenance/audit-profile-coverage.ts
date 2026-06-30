import { prisma } from "../lib/prisma";

async function main() {
  const [
    totalOrgs,
    orgsMissingPrefecture,
    orgsMissingLocation,
    highSchoolsMissingPrefecture,
    universitiesMissingPrefecture,
    totalPeople,
    athletes,
    athletesMissingHometown,
    athletesMissingNationality,
    athletesMissingKana,
    athletesMissingRoman,
    athletesMissingBirthDate,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { prefecture: null } }),
    prisma.organization.count({ where: { location: null } }),
    prisma.organization.count({ where: { type: "high_school", prefecture: null } }),
    prisma.organization.count({ where: { type: "university", prefecture: null } }),
    prisma.person.count(),
    prisma.person.count({ where: { type: "athlete" } }),
    prisma.person.count({ where: { type: "athlete", hometown: null } }),
    prisma.person.count({ where: { type: "athlete", nationality: null } }),
    prisma.person.count({ where: { type: "athlete", displayNameKana: null } }),
    prisma.person.count({ where: { type: "athlete", displayNameRoman: null } }),
    prisma.person.count({ where: { type: "athlete", birthDate: null } }),
  ]);

  const universities = await prisma.organization.findMany({
    where: {
      type: "university",
      prefecture: null,
    },
    select: {
      slug: true,
      nameJa: true,
      websiteUrl: true,
      location: true,
      country: true,
      _count: {
        select: {
          memberships: true,
          raceResults: true,
          sourceReferences: true,
        },
      },
      sourceReferences: {
        select: {
          sourceEntityType: true,
          sourceEntityKey: true,
          sourceUrl: true,
          source: {
            select: {
              name: true,
              type: true,
              url: true,
            },
          },
        },
        take: 5,
      },
    },
    orderBy: [{ memberships: { _count: "desc" } }, { nameJa: "asc" }],
  });

  const highSchools = await prisma.organization.findMany({
    where: {
      type: "high_school",
      prefecture: null,
    },
    select: {
      slug: true,
      nameJa: true,
      websiteUrl: true,
      _count: {
        select: {
          memberships: true,
          sourceReferences: true,
        },
      },
      sourceReferences: {
        select: {
          sourceEntityType: true,
          sourceEntityKey: true,
          sourceUrl: true,
          source: {
            select: {
              name: true,
              type: true,
              url: true,
            },
          },
        },
        take: 5,
      },
    },
    orderBy: [{ memberships: { _count: "desc" } }, { nameJa: "asc" }],
    take: 40,
  });

  const athletesNeedingProfile = await prisma.person.findMany({
    where: {
      type: "athlete",
      OR: [
        { hometown: null },
        { nationality: null },
        { displayNameKana: null },
        { displayNameRoman: null },
        { birthDate: null },
      ],
    },
    select: {
      slug: true,
      displayNameJa: true,
      displayNameKana: true,
      displayNameRoman: true,
      hometown: true,
      nationality: true,
      birthDate: true,
      memberships: {
        select: {
          organization: {
            select: {
              slug: true,
              nameJa: true,
              type: true,
              prefecture: true,
            },
          },
          startDate: true,
          endDate: true,
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      },
      raceResults: {
        where: {
          isStarter: true,
        },
        select: {
          race: {
            select: {
              slug: true,
              name: true,
              competitionEdition: {
                select: {
                  officialName: true,
                  year: true,
                },
              },
            },
          },
          organization: {
            select: {
              slug: true,
              nameJa: true,
              type: true,
            },
          },
          gradeAtRace: true,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 3,
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 30,
  });

  console.log(
    JSON.stringify(
      {
        summary: {
          totalOrgs,
          orgsMissingPrefecture,
          orgsMissingLocation,
          highSchoolsMissingPrefecture,
          universitiesMissingPrefecture,
          totalPeople,
          athletes,
          athletesMissingHometown,
          athletesMissingNationality,
          athletesMissingKana,
          athletesMissingRoman,
          athletesMissingBirthDate,
        },
        universities,
        highSchools,
        athletesNeedingProfile,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
