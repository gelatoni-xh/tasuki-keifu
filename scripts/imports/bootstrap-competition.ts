import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { bootstrapCompetition, type CompetitionBootstrapConfig } from "../lib/competition-bootstrap";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Usage: tsx scripts/imports/bootstrap-competition.ts <config.json>");
  }

  const configText = await readFile(path.resolve(inputPath), "utf8");
  const config = JSON.parse(configText) as CompetitionBootstrapConfig;

  await bootstrapCompetition(prisma, config);
  console.log(`Bootstrapped competition: ${config.competition.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
