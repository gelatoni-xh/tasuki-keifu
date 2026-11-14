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

test("women's events are excluded from bootstrap and result imports", async () => {
  assert.throws(
    () => assertCompetitionImportInScope({ raceNames: ["女子5000m"] }),
    /Women's race imports are currently out of scope/,
  );
  assert.throws(
    () => assertCompetitionImportInScope({ raceSlugs: ["meet-womens-5000-final"] }),
    /Women's race imports are currently out of scope/,
  );
  assert.doesNotThrow(() => assertCompetitionImportInScope({ raceNames: ["男子800m"] }));

  const noDatabaseAccess = new Proxy({}, {
    get() { assert.fail("Excluded women's bootstrap touched the database"); },
  }) as PrismaClient;
  await assert.rejects(bootstrapCompetition(noDatabaseAccess, {
    competition: { slug: "nittaidai-long-distance-meet", nameJa: "日本体育大学長距離競技会" },
    editions: [{ slug: "meet-2026", year: 2026, officialName: "第333回" }],
    races: [{ slug: "meet-2026-women-5000", editionSlug: "meet-2026", name: "女子5000m", discipline: "m5000" as never }],
  }), /Women's race imports are currently out of scope/);

  const readOnlyDb = {
    source: { findUnique: async () => ({ id: "source" }) },
    race: { findUnique: async () => ({ id: "race", name: "女子5000m" }) },
  } as unknown as PrismaClient;
  await assert.rejects(importRacePayload(readOnlyDb, {
    raceSlug: "meet-2026-track-event",
    sourceId: "source",
  } as RaceImportPayload), /Women's race imports are currently out of scope/);
});

test("changing just the series or race slug cannot bypass the withdrawn identifiers", () => {
  assert.throws(() => assertCompetitionImportInScope({ editionSlugs: ["hakone-qualifier-103"] }), /out of scope/);
  assert.throws(() => assertCompetitionImportInScope({ sourceId: "source-hakone-103-qualifier-official" }), /out of scope/);
});
