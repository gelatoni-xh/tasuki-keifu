import { prisma } from "../lib/prisma";
import { buildPlayerRelations } from "../../src/lib/player-relations/build-player-relations";
import { runScript } from "../lib/script-runtime";

await runScript(
  {
    script: "maintenance/recompute-player-relations",
    disconnect: () => prisma.$disconnect(),
  },
  async ({ logger }) => {
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
    let skippedCount = 0;
    const quiet = args.has("--quiet");

    logger.info("player_relation_recompute_started", {
      requested_limit: limit,
      requested_slugs: slugs,
      checked_people: people.length,
      include_empty: args.has("--include-empty"),
    });

    for (const person of people) {
      if (!args.has("--include-empty")) {
        const resultCount = await prisma.raceResult.count({
          where: { personId: person.id },
        });

        const membershipCount = await prisma.membership.count({
          where: { personId: person.id },
        });

        if (resultCount === 0 && membershipCount === 0) {
          skippedCount += 1;
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
        logger.info("player_relation_recomputed", {
          person_id: person.id,
          person_slug: person.slug,
          display_name_ja: person.displayNameJa,
          relation_count: payload.topRelations.length,
        });
      }
    }

    logger.info("player_relation_recompute_finished", {
      checked_people: people.length,
      updated_count: updatedCount,
      skipped_count: skippedCount,
    });
  },
);
