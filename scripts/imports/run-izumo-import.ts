import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { bootstrapCompetition, type CompetitionBootstrapConfig } from "../lib/competition-bootstrap";
import { type RaceImportPayload, raceImportPayloadSchema } from "../lib/import-types";
import { buildIzumoPayloadPath } from "../lib/izumo";
import { loadWorkspaceEnv } from "../lib/load-env";
import { importRacePayload } from "../lib/race-importer";

loadWorkspaceEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

async function main() {
  const edition = Number(process.argv[2] ?? "36");

  if (!Number.isFinite(edition)) {
    throw new Error("Usage: tsx scripts/imports/run-izumo-import.ts <edition>");
  }

  const bootstrapPath = path.resolve("data/config/izumo-bootstrap.json");
  const bootstrapConfig = JSON.parse(await readFile(bootstrapPath, "utf8")) as CompetitionBootstrapConfig;
  await bootstrapCompetition(prisma, bootstrapConfig);

  for (let leg = 1; leg <= 6; leg += 1) {
    const payloadPath = buildIzumoPayloadPath(edition, leg);
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
