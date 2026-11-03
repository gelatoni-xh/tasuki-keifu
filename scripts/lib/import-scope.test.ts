import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapCompetition } from "./competition-bootstrap";
import { importRacePayload } from "./race-importer";
import { assertCompetitionImportInScope } from "./import-scope";
import type { PrismaClient } from "@prisma/client";
import type { RaceImportPayload } from "./import-types";

test("withdrawn qualifier bootstrap and race import fail before any DB access", async () => {
  const noDatabaseAccess = new Proxy({}, {
    get() { assert.fail("Excluded import touched the database"); },
  }) as PrismaClient;
  await assert.rejects(bootstrapCompetition(noDatabaseAccess, {
    competition: { slug: "hakone-qualifier", nameJa: "箱根予選会" },
    editions: [], races: [],
  }), /out of scope/);
  await assert.rejects(importRacePayload(noDatabaseAccess, {
    raceSlug: "hakone-qualifier-103-men-half-marathon",
    sourceId: "source-hakone-103-qualifier-official",
  } as RaceImportPayload), /out of scope/);
});

test("scope rules allow ordinary track qualifying heats and Hakone main races", () => {
  for (const raceSlug of ["japanese-student-individual-championships-2025-men-1500-heat-1", "hakone-103-leg-1", "nittaidai-long-distance-meet-332-men-5000-heat-1"]) {
    assert.doesNotThrow(() => assertCompetitionImportInScope({ raceSlugs: [raceSlug] }));
  }
});

test("changing just the series or race slug cannot bypass the withdrawn identifiers", () => {
  assert.throws(() => assertCompetitionImportInScope({ editionSlugs: ["hakone-qualifier-103"] }), /out of scope/);
  assert.throws(() => assertCompetitionImportInScope({ sourceId: "source-hakone-103-qualifier-official" }), /out of scope/);
});
