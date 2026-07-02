import { randomUUID } from "node:crypto";

import { createLogger, installProcessErrorHandlers } from "../../src/lib/logger";

type ScriptContext = {
  logger: ReturnType<typeof createLogger>;
  runId: string;
};

type RunScriptOptions = {
  script: string;
  disconnect?: () => Promise<void>;
};

export async function runScript(
  { script, disconnect }: RunScriptOptions,
  runner: (context: ScriptContext) => Promise<void>,
) {
  const runId = randomUUID();
  const logger = installProcessErrorHandlers("script-runtime", {
    script,
    run_id: runId,
  }).child({
    script,
    run_id: runId,
  });
  const startedAt = Date.now();

  logger.info("script_started");

  try {
    await runner({ logger, runId });
    logger.info("script_completed", {
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error("script_failed", {
      duration_ms: Date.now() - startedAt,
      error,
    });
    process.exitCode = 1;
  } finally {
    if (disconnect) {
      await disconnect();
    }
  }
}
