import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

async function main() {
  const names = ["智辯カレッジ高", "高知農高", "松山商高", "遊学館高", "長野日大高", "高岡向陵高"];
  const organizations = await prisma.organization.findMany({
    where: {
      type: "high_school",
      OR: [
        { nameJa: { in: names } },
        { nameVariants: { some: { value: { in: names } } } },
      ],
    },
    include: {
      nameVariants: true,
    },
  });

  console.log(JSON.stringify(
    organizations.map((organization) => ({
      slug: organization.slug,
      nameJa: organization.nameJa,
      prefecture: organization.prefecture,
      variants: organization.nameVariants.map((variant) => variant.value),
    })),
    null,
    2,
  ));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
