import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { raceImportPayloadSchema } from "../lib/import-types";
import { importRacePayload } from "../lib/race-importer";
import { runScript } from "../lib/script-runtime";

await runScript(
  {
    script: "imports/import-race",
    disconnect: () => prisma.$disconnect(),
  },
  async ({ logger, runId }) => {
    const inputPath = process.argv[2];

    if (!inputPath) {
      throw new Error("Usage: tsx scripts/imports/import-race.ts <payload.json>");
    }

    const resolvedInputPath = path.resolve(inputPath);
    const payloadText = await readFile(resolvedInputPath, "utf8");
    const payload = raceImportPayloadSchema.parse(JSON.parse(payloadText));

    await importRacePayload(prisma, payload);
    logger.info("race_import_completed", {
      run_id: runId,
      input_path: resolvedInputPath,
      batch_key: payload.batchKey,
      race_slug: payload.raceSlug,
    });
  },
);
