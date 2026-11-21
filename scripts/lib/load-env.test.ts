import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadWorkspaceEnv } from "./load-env";

test("development selects its local snapshot over the legacy production tunnel", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tasuki-env-"));
  try {
    mkdirSync(path.join(root, ".config/tasuki-keifu"), { recursive: true });
    writeFileSync(path.join(root, ".env"), "DATABASE_URL=postgresql://legacy@localhost:15432/production\nOTHER_SETTING=loaded\n");
    writeFileSync(path.join(root, ".config/tasuki-keifu/development.env"), "export DATABASE_URL='postgresql://dev@127.0.0.1:25432/snapshot'\n");
    const env: NodeJS.ProcessEnv = {};
    loadWorkspaceEnv({ env, cwd: root, home: root });
    assert.equal(new URL(env.DATABASE_URL!).port, "25432");
    assert.equal(env.OTHER_SETTING, "loaded");

    const production: NodeJS.ProcessEnv = { NODE_ENV: "production", DATABASE_URL: "postgresql://production@postgres:5432/live" };
    loadWorkspaceEnv({ env: production, cwd: root, home: root });
    assert.equal(new URL(production.DATABASE_URL!).hostname, "postgres");

    const explicit: NodeJS.ProcessEnv = { DATABASE_URL: "postgresql://test@localhost:5432/explicit" };
    loadWorkspaceEnv({ env: explicit, cwd: root, home: root });
    assert.equal(new URL(explicit.DATABASE_URL!).pathname, "/explicit");

    writeFileSync(path.join(root, ".env.production"), "DATABASE_URL=postgresql://production@postgres:5432/live\n");
    const deployed: NodeJS.ProcessEnv = { NODE_ENV: "production" };
    loadWorkspaceEnv({ env: deployed, cwd: root, home: root });
    assert.equal(new URL(deployed.DATABASE_URL!).hostname, "postgres");

    writeFileSync(path.join(root, ".env.development.local"), "DATABASE_URL=postgresql://experiment@localhost:5432/experiment\n");
    const projectOverride: NodeJS.ProcessEnv = {};
    loadWorkspaceEnv({ env: projectOverride, cwd: root, home: root });
    assert.equal(new URL(projectOverride.DATABASE_URL!).pathname, "/experiment");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
