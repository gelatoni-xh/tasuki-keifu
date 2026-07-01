import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { bootstrapCompetition, type CompetitionBootstrapConfig } from "../lib/competition-bootstrap";
import { type RaceImportPayload, raceImportPayloadSchema } from "../lib/import-types";
import { loadWorkspaceEnv } from "../lib/load-env";
import { importRacePayload } from "../lib/race-importer";
import { buildAllJapanUniversityEkidenPayloadPath } from "../lib/all-japan-university-ekiden";

loadWorkspaceEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

async function main() {
  const edition = Number(process.argv[2] ?? "57");

  if (!Number.isFinite(edition)) {
    throw new Error("Usage: tsx scripts/imports/run-all-japan-university-ekiden-import.ts <edition>");
  }

  const bootstrapPath = path.resolve("data/config/all-japan-university-ekiden-bootstrap.json");
  const bootstrapConfig = JSON.parse(await readFile(bootstrapPath, "utf8")) as CompetitionBootstrapConfig;
  await bootstrapCompetition(prisma, bootstrapConfig);

  for (let leg = 1; leg <= 8; leg += 1) {
    const payloadPath = buildAllJapanUniversityEkidenPayloadPath(edition, leg);
    const payload = raceImportPayloadSchema.parse(
      JSON.parse(await readFile(payloadPath, "utf8")),
    ) as RaceImportPayload;
    await importRacePayload(prisma, payload);
    console.log(`Imported ${payload.raceSlug}`);
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
