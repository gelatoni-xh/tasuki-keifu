import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

async function main() {
  const edition = await prisma.competitionEdition.findUnique({
    where: { slug: "national-high-school-ekiden-2025-men" },
    include: {
      teamCompetitionResults: {
        include: {
          organization: true,
          legSnapshots: true,
        },
        orderBy: [{ finalRank: "asc" }],
      },
      races: {
        include: {
          raceResults: {
            include: {
              person: {
                include: {
                  memberships: {
                    include: {
                      organization: true,
                    },
                  },
                },
              },
              organization: true,
            },
          },
        },
      },
    },
  });

  if (!edition) {
    throw new Error("Missing edition national-high-school-ekiden-2025-men");
  }

  const teamResults = edition.teamCompetitionResults;
  const schoolNameGroups = new Map<string, Set<string>>();
  const representativeSummary = { prefecture: 0, region: 0, missing: 0 };

  for (const result of teamResults) {
    const group = schoolNameGroups.get(result.organization.nameJa) ?? new Set<string>();
    group.add(result.organization.slug);
    schoolNameGroups.set(result.organization.nameJa, group);

    if (result.notes === "都道府県代表") {
      representativeSummary.prefecture += 1;
    } else if (result.notes?.startsWith("地区代表:")) {
      representativeSummary.region += 1;
    } else {
      representativeSummary.missing += 1;
    }
  }

  const duplicateSchoolNames = [...schoolNameGroups.entries()]
    .filter(([, slugs]) => slugs.size > 1)
    .map(([name, slugs]) => ({ name, slugs: [...slugs] }));

  const allRaceResults = edition.races.flatMap((race) => race.raceResults);
  const personSchoolPairs = new Map<string, Set<string>>();
  const suspiciousPeople: Array<{
    personSlug: string;
    displayNameJa: string;
    raceOrganizations: string[];
    membershipHighSchools: string[];
  }> = [];

  for (const result of allRaceResults) {
    const person = result.person;
    const schoolSlug = result.organization?.slug;
    if (!schoolSlug) continue;

    const seen = personSchoolPairs.get(person.slug) ?? new Set<string>();
    seen.add(schoolSlug);
    personSchoolPairs.set(person.slug, seen);

    const membershipHighSchools = person.memberships
      .filter((membership) => membership.organization.type === "high_school")
      .map((membership) => membership.organization.slug);

    if (membershipHighSchools.length > 0 && !membershipHighSchools.includes(schoolSlug)) {
      suspiciousPeople.push({
        personSlug: person.slug,
        displayNameJa: person.displayNameJa,
        raceOrganizations: [schoolSlug],
        membershipHighSchools,
      });
    }
  }

  const multiSchoolPeople = [...personSchoolPairs.entries()]
    .filter(([, schools]) => schools.size > 1)
    .map(([personSlug, schools]) => ({ personSlug, schools: [...schools] }));

  console.log(JSON.stringify({
    teamCount: teamResults.length,
    representativeSummary,
    duplicateSchoolNames,
    multiSchoolPeople,
    suspiciousPeople,
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
