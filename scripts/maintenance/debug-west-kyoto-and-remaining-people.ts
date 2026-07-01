import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

async function main() {
  const [organizations, people] = await Promise.all([
    prisma.organization.findMany({
      where: {
        OR: [{ nameJa: "西京高校" }, { nameJa: "山口県立西京高校" }, { slug: "saikyo-high-school" }],
      },
      include: {
        nameVariants: true,
        _count: {
          select: {
            memberships: true,
            raceResults: true,
            teamCompetitionResults: true,
          },
        },
      },
    }),
    prisma.person.findMany({
      where: {
        displayNameJa: {
          in: ["沼田 晃", "井坂 光"],
        },
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
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        organizations,
        people,
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
