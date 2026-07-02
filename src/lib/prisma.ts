import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { installProcessErrorHandlers } from "@/lib/logger";

const prismaLogger = installProcessErrorHandlers("prisma");

function createLogConfig() {
  if (process.env.NODE_ENV === "development") {
    return [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ] satisfies Prisma.LogDefinition[];
  }

  return [
    { emit: "event", level: "error" },
  ] satisfies Prisma.LogDefinition[];
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    prismaLogger.error("database_url_missing");
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg(connectionString);

  return new PrismaClient({
    adapter,
    log: createLogConfig(),
  });
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

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

if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (event) => {
    prismaLogger.debug("prisma_query", {
      target: event.target,
      duration_ms: event.duration,
      query: event.query,
      params: event.params,
    });
  });
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
