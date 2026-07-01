import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

async function main() {
  const edition = await prisma.competitionEdition.findUnique({
    where: { slug: "national-high-school-ekiden-2024-men" },
    include: {
      teamCompetitionResults: {
        include: {
          organization: true,
        },
        orderBy: [{ finalRank: "asc" }],
      },
    },
  });

  if (!edition) {
    throw new Error("Missing edition");
  }

  const noteCounts = edition.teamCompetitionResults.reduce<Record<string, number>>((acc, row) => {
    const key = row.notes ?? "NULL";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    noteCounts,
    missing: edition.teamCompetitionResults
      .filter((row) => row.notes == null)
      .map((row) => ({
        school: row.organization.nameJa,
        slug: row.organization.slug,
      })),
    sample: edition.teamCompetitionResults.slice(0, 15).map((row) => ({
      school: row.organization.nameJa,
      slug: row.organization.slug,
      notes: row.notes,
    })),
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
