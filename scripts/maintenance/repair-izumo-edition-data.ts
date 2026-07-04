import { readFile } from "node:fs/promises";

import { prisma } from "../lib/prisma";
import { raceImportPayloadSchema } from "../lib/import-types";
import { buildIzumoPayloadPath } from "../lib/izumo";
import {
  createOrStartImportBatch,
  finalizeImportBatch,
  upsertRaceEntry,
  upsertTeamCompetitionResult,
} from "../lib/import-utils";

const protectedProfileSlugs = new Set(["asahi-kuroda", "kudo-shinsaku", "kiyoto-hirabayashi"]);

async function main() {
  const editions = process.argv.slice(2).map((value) => Number(value)).filter((value) => Number.isFinite(value));

  if (editions.length === 0) {
    throw new Error("Usage: tsx scripts/maintenance/repair-izumo-edition-data.ts <edition...>");
  }

  for (const edition of editions) {
    const payloads = await Promise.all(
      Array.from({ length: 6 }, async (_, index) => {
        const leg = index + 1;
        const payload = raceImportPayloadSchema.parse(
          JSON.parse(await readFile(buildIzumoPayloadPath(edition, leg), "utf8")),
        );
        const race = await prisma.race.findUnique({
          where: { slug: payload.raceSlug },
          include: {
            raceResults: {
              include: {
                person: {
                  select: {
                    slug: true,
                  },
                },
                organization: {
                  select: {
                    slug: true,
                  },
                },
              },
            },
          },
        });

        if (!race) {
          throw new Error(`Missing race ${payload.raceSlug}`);
        }

        return {
          leg,
          payload,
          race,
        };
      }),
    );

    const repairBatch = await createOrStartImportBatch(prisma, {
      batchKey: `izumo-${edition}-repair-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
      sourceId: payloads[0]?.payload.sourceId ?? `source-izumo-ekiden-${edition}-official-record`,
      raceSlug: `izumo-ekiden-${edition}-leg-6`,
      summary: `第${edition}回出雲駅伝 payload 精准修复`,
      pbNotes: payloads[0]?.payload.pbNotes ?? `第${edition}回出雲駅伝 payload repair`,
      entries: payloads[0]?.payload.entries ?? [],
      teamResults: payloads[0]?.payload.teamResults ?? [],
    });

    try {
      const repairedRaceEntries: Array<{ leg: number; slug: string; reason: string }> = [];
      const repairedTeamRows: Array<{ leg: number; organizationSlug: string }> = [];

      for (const { leg, payload, race } of payloads) {
        const raceResultsBySlug = new Map(
          race.raceResults.map((result) => [result.person.slug, result]),
        );
        const findSameVisibleEntry = (displayNameJa: string, organizationSlug: string) =>
          race.raceResults.find(
            (result) =>
              result.person.displayNameJa === displayNameJa &&
              result.organization?.slug === organizationSlug,
          );

        for (const entry of payload.entries) {
          const existingResult = raceResultsBySlug.get(entry.slug);
          const existingOrganizationSlug = existingResult?.organization?.slug ?? null;
          const isMissingResult = !existingResult;
          const needsOrganizationRepair = existingResult && existingOrganizationSlug !== entry.raceOrganizationSlug;
          const sameVisibleEntry = isMissingResult
            ? findSameVisibleEntry(entry.displayNameJa, entry.raceOrganizationSlug)
            : null;

          if ((!isMissingResult && !needsOrganizationRepair) || sameVisibleEntry) {
            continue;
          }

          await upsertRaceEntry(prisma, {
            batchId: repairBatch.id,
            sourceId: payload.sourceId,
            raceId: race.id,
            pbNotes: payload.pbNotes,
            protectedProfileSlugs,
            entry,
          });

          repairedRaceEntries.push({
            leg,
            slug: entry.slug,
            reason: isMissingResult ? "missing_race_result" : `organization_mismatch:${existingOrganizationSlug ?? "null"}`,
          });
        }

        for (const teamResult of payload.teamResults) {
          await upsertTeamCompetitionResult(prisma, {
            batchId: repairBatch.id,
            sourceId: payload.sourceId,
            raceId: race.id,
            teamResult,
          });
          repairedTeamRows.push({
            leg,
            organizationSlug: teamResult.organizationSlug,
          });
        }
      }

      await finalizeImportBatch(prisma, repairBatch.id, "completed");
      console.log(JSON.stringify({
        edition,
        repairedRaceEntryCount: repairedRaceEntries.length,
        repairedRaceEntries,
        repairedTeamRowCount: repairedTeamRows.length,
      }, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finalizeImportBatch(prisma, repairBatch.id, "failed", message);
      throw error;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
