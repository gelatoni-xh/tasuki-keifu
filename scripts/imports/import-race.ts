import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { raceImportPayloadSchema } from "../lib/import-types";
import { createOrStartImportBatch, finalizeImportBatch, upsertRaceEntry, validateRaceImportDuplicates } from "../lib/import-utils";

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Usage: tsx scripts/imports/import-race.ts <payload.json>");
  }

  const payloadText = await readFile(path.resolve(inputPath), "utf8");
  const payload = raceImportPayloadSchema.parse(JSON.parse(payloadText));

  const source = await prisma.source.findUnique({
    where: { id: payload.sourceId },
  });

  if (!source) {
    throw new Error(`Missing source: ${payload.sourceId}`);
  }

  const race = await prisma.race.findUnique({
    where: { slug: payload.raceSlug },
  });

  if (!race) {
    throw new Error(`Missing race: ${payload.raceSlug}`);
  }

  const batch = await createOrStartImportBatch(prisma, payload);
  const protectedProfileSlugs = new Set(["asahi-kuroda", "kudo-shinsaku", "kiyoto-hirabayashi"]);

  try {
    await validateRaceImportDuplicates(prisma, payload.entries);

    for (const entry of payload.entries) {
      await upsertRaceEntry(prisma, {
        batchId: batch.id,
        sourceId: payload.sourceId,
        raceId: race.id,
        pbNotes: payload.pbNotes,
        protectedProfileSlugs,
        entry,
      });
    }

    await finalizeImportBatch(prisma, batch.id, "completed");
    console.log(`Import completed: ${payload.batchKey}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeImportBatch(prisma, batch.id, "failed", message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
