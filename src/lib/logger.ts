import { appendFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

type LoggerOptions = {
  module: string;
  bindings?: LogContext;
};

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

const LOG_RETENTION_DAYS = getPositiveInteger(process.env.TASUKI_LOG_RETENTION_DAYS, 3);
const LOG_DIR = process.env.TASUKI_LOG_DIR?.trim() || null;

const globalForLogger = globalThis as typeof globalThis & {
  __tasukiLogCleanupDate?: string;
  __tasukiProcessHandlerKeys?: Set<string>;
};

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getLogFilePath(now: Date) {
  if (!LOG_DIR) {
    return null;
  }

  return path.join(LOG_DIR, `${formatDateKey(now)}.log`);
}

function serializeError(error: Error): SerializedError {
  const serialized: SerializedError = {
    name: error.name,
    message: error.message,
  };

  if (error.stack) {
    serialized.stack = error.stack;
  }

  const withCause = error as Error & { cause?: unknown };

  if (withCause.cause !== undefined) {
    serialized.cause = normalizeValue(withCause.cause);
  }

  return serialized;
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)]),
    );
  }

  return value;
}

function normalizeContext(context: LogContext | undefined) {
  if (!context) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, normalizeValue(value)]),
  );
}

async function cleanupExpiredLogFiles(now: Date) {
  if (!LOG_DIR) {
    return;
  }

  const cleanupDate = formatDateKey(now);

  if (globalForLogger.__tasukiLogCleanupDate === cleanupDate) {
    return;
  }

  globalForLogger.__tasukiLogCleanupDate = cleanupDate;

  try {
    await mkdir(LOG_DIR, { recursive: true });
    const entries = await readdir(LOG_DIR, { withFileTypes: true });
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    cutoff.setUTCDate(cutoff.getUTCDate() - LOG_RETENTION_DAYS + 1);

    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.log$/.test(entry.name))
        .map(async (entry) => {
          const entryDate = entry.name.slice(0, 10);

          if (entryDate >= formatDateKey(cutoff)) {
            return;
          }

          await rm(path.join(LOG_DIR, entry.name), { force: true });
        }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`[tasuki-logger] log cleanup failed: ${detail}\n`);
  }
}

function writeLine(line: string, level: LogLevel) {
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

function persistLine(line: string, now: Date) {
  const logFilePath = getLogFilePath(now);

  if (!logFilePath) {
    return;
  }

  void cleanupExpiredLogFiles(now);
  void mkdir(LOG_DIR!, { recursive: true })
    .then(() => appendFile(logFilePath, `${line}\n`, "utf8"))
    .catch((error) => {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`[tasuki-logger] log write failed: ${detail}\n`);
    });
}

function emitLog(level: LogLevel, moduleName: string, bindings: LogContext, message: string, context?: LogContext) {
  const now = new Date();
  const entry = {
    timestamp: now.toISOString(),
    level,
    module: moduleName,
    env: process.env.NODE_ENV ?? "development",
    message,
    ...normalizeContext(bindings),
    ...normalizeContext(context),
  };
  const line = JSON.stringify(entry);

  writeLine(line, level);
  persistLine(line, now);
}

export class Logger {
  private readonly moduleName: string;
  private readonly bindings: LogContext;

  constructor({ module, bindings }: LoggerOptions) {
    this.moduleName = module;
    this.bindings = bindings ?? {};
  }

  child(bindings: LogContext) {
    return new Logger({
      module: this.moduleName,
      bindings: {
        ...this.bindings,
        ...bindings,
      },
    });
  }

  debug(message: string, context?: LogContext) {
    emitLog("debug", this.moduleName, this.bindings, message, context);
  }

  info(message: string, context?: LogContext) {
    emitLog("info", this.moduleName, this.bindings, message, context);
  }

  warn(message: string, context?: LogContext) {
    emitLog("warn", this.moduleName, this.bindings, message, context);
  }

  error(message: string, context?: LogContext) {
    emitLog("error", this.moduleName, this.bindings, message, context);
  }
}

export function createLogger(moduleName: string, bindings?: LogContext) {
  return new Logger({ module: moduleName, bindings });
}

export function installProcessErrorHandlers(moduleName: string, bindings?: LogContext) {
  const logger = createLogger(moduleName, bindings);
  const handlerKey = `${moduleName}:${JSON.stringify(normalizeContext(bindings))}`;
  const registeredKeys = globalForLogger.__tasukiProcessHandlerKeys ?? new Set<string>();

  if (!globalForLogger.__tasukiProcessHandlerKeys) {
    globalForLogger.__tasukiProcessHandlerKeys = registeredKeys;
  }

  if (registeredKeys.has(handlerKey)) {
    return logger;
  }

  registeredKeys.add(handlerKey);

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled_rejection", {
      reason: normalizeValue(reason),
    });
  });

  process.on("uncaughtExceptionMonitor", (error, origin) => {
    logger.error("uncaught_exception", {
      error,
      origin,
    });
  });

  return logger;
}
