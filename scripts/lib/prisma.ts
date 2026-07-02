import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

import { installProcessErrorHandlers } from "../../src/lib/logger";
import { loadWorkspaceEnv } from "./load-env";

loadWorkspaceEnv();

const prismaLogger = installProcessErrorHandlers("script-prisma");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  prismaLogger.error("database_url_missing");
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg(connectionString);

function createLogConfig() {
  return [
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" },
  ] satisfies Prisma.LogDefinition[];
}

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: createLogConfig(),
  });
}

type ScriptPrismaClient = ReturnType<typeof createPrismaClient>;

export const prisma: ScriptPrismaClient = createPrismaClient();

prisma.$on("error", (event) => {
  prismaLogger.error("prisma_error", {
    target: event.target,
    message: event.message,
  });
});

prisma.$on("warn", (event) => {
  prismaLogger.warn("prisma_warn", {
    target: event.target,
    message: event.message,
  });
});
