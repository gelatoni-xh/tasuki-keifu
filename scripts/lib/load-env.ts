import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

export function loadWorkspaceEnv({
  env = process.env,
  cwd = process.cwd(),
  home = homedir(),
}: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  home?: string;
} = {}) {
  const environment = env.NODE_ENV ?? "development";
  const files = [path.join(cwd, `.env.${environment}.local`)];
  if (environment === "development") {
    files.push(path.join(home, ".config/tasuki-keifu/development.env"));
  }
  if (environment !== "test") files.push(path.join(cwd, ".env.local"));
  files.push(path.join(cwd, `.env.${environment}`), path.join(cwd, ".env"));

  // Explicit process settings win; then load files from most to least specific.
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
      if (env[key] === undefined) env[key] = value;
    }
  }
}
