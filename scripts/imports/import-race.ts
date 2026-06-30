import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { raceImportPayloadSchema } from "../lib/import-types";
import { importRacePayload } from "../lib/race-importer";

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Usage: tsx scripts/imports/import-race.ts <payload.json>");
  }

  const payloadText = await readFile(path.resolve(inputPath), "utf8");
  const payload = raceImportPayloadSchema.parse(JSON.parse(payloadText));

  try {
    await importRacePayload(prisma, payload);
    console.log(`Import completed: ${payload.batchKey}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
