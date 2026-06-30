import { prisma } from "../lib/prisma";
import { buildPlayerRelations } from "../../src/lib/player-relations/build-player-relations";

async function main() {
  const args = new Set(process.argv.slice(2));
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const slugsArg = process.argv.find((arg) => arg.startsWith("--slugs="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) : null;
  const slugs = slugsArg
    ? slugsArg
        .split("=")[1]
        ?.split(",")
        .map((slug) => slug.trim())
        .filter(Boolean) ?? []
    : [];

  const people = await prisma.person.findMany({
    where: slugs.length > 0 ? { slug: { in: slugs } } : undefined,
    orderBy: {
      updatedAt: "desc",
    },
    take: slugs.length > 0 ? undefined : (Number.isFinite(limit) && limit ? limit : 100),
    select: {
      id: true,
      slug: true,
      displayNameJa: true,
    },
  });

  let updatedCount = 0;
  const quiet = args.has("--quiet");

  for (const person of people) {
    if (!args.has("--include-empty")) {
      const resultCount = await prisma.raceResult.count({
        where: { personId: person.id },
      });

      const membershipCount = await prisma.membership.count({
        where: { personId: person.id },
      });

      if (resultCount === 0 && membershipCount === 0) {
        continue;
      }
    }

    const payload = await buildPlayerRelations(person.id);

    await prisma.playerRelationCache.upsert({
      where: { personId: person.id },
      update: {
        payload,
        generatedAt: new Date(payload.generatedAt),
      },
      create: {
        personId: person.id,
        payload,
        generatedAt: new Date(payload.generatedAt),
      },
    });

    updatedCount += 1;
    if (!quiet) {
      console.log(`updated ${person.slug} (${person.displayNameJa})`);
    }
  }

  console.log(JSON.stringify({
    checkedPeople: people.length,
    updatedCount,
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
