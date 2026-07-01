import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

async function main() {
  const rows = await prisma.raceResult.findMany({
    where: {
      race: {
        competitionEdition: {
          slug: "national-high-school-ekiden-2024-men",
        },
      },
      notes: {
        not: null,
      },
    },
    include: {
      race: true,
      person: true,
      organization: true,
    },
    orderBy: [{ race: { leg: "asc" } }, { rank: "asc" }],
  });

  console.log(
    JSON.stringify(
      rows.map((row) => ({
        leg: row.race.leg,
        rank: row.rank,
        displayNameJa: row.person.displayNameJa,
        organizationNameJa: row.organization?.nameJa ?? null,
        notes: row.notes,
      })),
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
