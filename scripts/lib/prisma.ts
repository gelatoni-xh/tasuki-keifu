import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { loadWorkspaceEnv } from "./load-env";

loadWorkspaceEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg(connectionString);

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

type ScriptPrismaClient = ReturnType<typeof createPrismaClient>;

export const prisma: ScriptPrismaClient = createPrismaClient();
