import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { loadWorkspaceEnv } from "./lib/load-env";

process.env.NODE_ENV = "development";
loadWorkspaceEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("Development DATABASE_URL is missing. Configure a local database before starting.");
}

const database = new URL(process.env.DATABASE_URL);
console.log(`[dev] Database: ${database.hostname}:${database.port || "5432"}${database.pathname}`);

if (database.hostname === "127.0.0.1" && database.port === "25432") {
  const startup = spawnSync("bash", [path.resolve("scripts/local/offline-postgres.sh"), "start"], {
    stdio: "inherit",
  });
  if (startup.error || startup.status !== 0) {
    throw new Error("Could not start the isolated offline PostgreSQL instance.");
  }
}

const child = spawn(process.execPath, [
  require.resolve("next/dist/bin/next"), "dev", ...process.argv.slice(2),
], { stdio: "inherit", env: process.env });

child.on("error", () => {
  console.error("Could not start the development server.");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
