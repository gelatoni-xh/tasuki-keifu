import { defineConfig } from "prisma/config";

import { loadWorkspaceEnv } from "./scripts/lib/load-env";

loadWorkspaceEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
