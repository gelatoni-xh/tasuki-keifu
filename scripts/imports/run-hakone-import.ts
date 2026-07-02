import { spawn } from "node:child_process";
import path from "node:path";

import { buildHakonePayloadPath } from "../lib/hakone";
import { runScript } from "../lib/script-runtime";

type Phase = "generate" | "import" | "all";

function parseArgs(argv: string[]) {
  const options = {
    edition: 0,
    legs: [] as number[],
    concurrency: 4,
    phase: "all" as Phase,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--edition") {
      options.edition = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--legs") {
      options.legs = (argv[index + 1] ?? "")
        .split(",")
        .map((value) => Number(value.trim()))
        .filter(Boolean);
      index += 1;
    } else if (arg === "--concurrency") {
      options.concurrency = Number(argv[index + 1]) || 4;
      index += 1;
    } else if (arg === "--phase") {
      const phase = argv[index + 1] as Phase;
      if (phase === "generate" || phase === "import" || phase === "all") {
        options.phase = phase;
      }
      index += 1;
    }
  }

  return options;
}

function runCommand(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: path.resolve("."),
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: pnpm ${args.join(" ")}`));
    });
    child.on("error", reject);
  });
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) {
        return;
      }
      await worker(item);
    }
  });

  await Promise.all(runners);
}

await runScript(
  {
    script: "imports/run-hakone-import",
  },
  async ({ logger }) => {
    const options = parseArgs(process.argv.slice(2));

    if (!options.edition) {
      throw new Error("Usage: tsx scripts/imports/run-hakone-import.ts --edition <edition> [--legs 1,2,3] [--concurrency 4] [--phase generate|import|all]");
    }

    const legs = options.legs.length > 0 ? options.legs : Array.from({ length: 10 }, (_, index) => index + 1);

    logger.info("hakone_import_requested", {
      edition: options.edition,
      phase: options.phase,
      concurrency: options.concurrency,
      leg_count: legs.length,
      legs,
    });

    if (options.phase === "generate" || options.phase === "all") {
      await runWithConcurrency(legs, options.concurrency, async (leg) => {
        await runCommand(["tsx", "scripts/imports/generate-hakone-leg-payload.ts", String(options.edition), String(leg)]);
      });
    }

    if (options.phase === "import" || options.phase === "all") {
      for (const leg of legs) {
        await runCommand(["import:race", buildHakonePayloadPath(options.edition, leg)]);
      }
    }

    logger.info("hakone_import_finished", {
      edition: options.edition,
      phase: options.phase,
      leg_count: legs.length,
    });
  },
);
