import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { raceImportPayloadSchema } from "../lib/import-types";
import { upsertRaceEntry, validateRaceImportDuplicates } from "../lib/import-utils";

async function main() {
  const inputPath = process.argv[2];
  const startIndex = Number(process.argv[3] ?? "1");

  if (!inputPath) {
    throw new Error("Usage: tsx scripts/maintenance/debug-import-race-entry.ts <payload.json> [startIndex]");
  }

  const payloadText = await readFile(path.resolve(inputPath), "utf8");
  const payload = raceImportPayloadSchema.parse(JSON.parse(payloadText));
  const race = await prisma.race.findUnique({ where: { slug: payload.raceSlug } });
  if (!race) {
    throw new Error(`Missing race ${payload.raceSlug}`);
  }

  await validateRaceImportDuplicates(prisma, payload.entries);

  for (let index = startIndex - 1; index < payload.entries.length; index += 1) {
    const entry = payload.entries[index];
    try {
      await upsertRaceEntry(prisma, {
        batchId: "debug-import-race-entry",
        sourceId: payload.sourceId,
        raceId: race.id,
        pbNotes: payload.pbNotes,
        protectedProfileSlugs: new Set(["asahi-kuroda", "kudo-shinsaku", "kiyoto-hirabayashi"]),
        entry,
      });
      console.log(`OK ${index + 1} ${entry.displayNameJa}`);
    } catch (error) {
      console.error(`FAIL ${index + 1} ${entry.displayNameJa}`);
      console.error(error);
      break;
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
