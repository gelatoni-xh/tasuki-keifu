import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

const TARGET_SLUGS = [
  "hs-樟南高",
  "hs-e4b889e69da1e9ab98e6a0a1",
  "hs-山形南高",
  "hs-福岡一高",
  "hs-東播磨高",
];

async function main() {
  const organizations = await prisma.organization.findMany({
    where: {
      slug: {
        in: TARGET_SLUGS,
      },
    },
    select: {
      slug: true,
      nameJa: true,
      prefecture: true,
    },
    orderBy: {
      slug: "asc",
    },
  });

  console.log(JSON.stringify(organizations, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
