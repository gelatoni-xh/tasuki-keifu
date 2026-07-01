import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { raceImportPayloadSchema } from "../lib/import-types";
import { createOrStartImportBatch, finalizeImportBatch, upsertTeamCompetitionResult } from "../lib/import-utils";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: tsx scripts/maintenance/import-team-results-from-payload.ts <payload.json>");
  }

  const payloadText = await readFile(path.resolve(inputPath), "utf8");
  const payload = raceImportPayloadSchema.parse(JSON.parse(payloadText));
  const race = await prisma.race.findUnique({ where: { slug: payload.raceSlug } });
  if (!race) {
    throw new Error(`Missing race ${payload.raceSlug}`);
  }

  const batch = await createOrStartImportBatch(prisma, {
    ...payload,
    batchKey: `${payload.batchKey}-team-only`,
  });

  try {
    for (const teamResult of payload.teamResults) {
      await upsertTeamCompetitionResult(prisma, {
        batchId: batch.id,
        sourceId: payload.sourceId,
        raceId: race.id,
        teamResult,
      });
    }
    await finalizeImportBatch(prisma, batch.id, "completed");
    console.log(`Imported team results: ${payload.raceSlug}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeImportBatch(prisma, batch.id, "failed", message);
    throw error;
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
