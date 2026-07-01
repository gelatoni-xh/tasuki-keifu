import type { PrismaClient } from "@prisma/client";

import { type RaceImportPayload } from "./import-types";
import { bumpCacheInvalidationScope } from "./cache-invalidation";
import {
  createOrStartImportBatch,
  finalizeImportBatch,
  upsertRaceEntry,
  upsertTeamCompetitionResult,
  validateRaceImportDuplicates,
} from "./import-utils";

export async function importRacePayload(prisma: PrismaClient, payload: RaceImportPayload) {
  const source = await prisma.source.findUnique({
    where: { id: payload.sourceId },
  });

  if (!source) {
    throw new Error(`Missing source: ${payload.sourceId}`);
  }

  const race = await prisma.race.findUnique({
    where: { slug: payload.raceSlug },
  });

  if (!race) {
    throw new Error(`Missing race: ${payload.raceSlug}`);
  }

  const batch = await createOrStartImportBatch(prisma, payload);
  const protectedProfileSlugs = new Set(["asahi-kuroda", "kudo-shinsaku", "kiyoto-hirabayashi"]);

  try {
    await validateRaceImportDuplicates(prisma, payload.entries);

    for (const entry of payload.entries) {
      await upsertRaceEntry(prisma, {
        batchId: batch.id,
        sourceId: payload.sourceId,
        raceId: race.id,
        pbNotes: payload.pbNotes,
        protectedProfileSlugs,
        entry,
      });
    }

    for (const teamResult of payload.teamResults) {
      await upsertTeamCompetitionResult(prisma, {
        batchId: batch.id,
        sourceId: payload.sourceId,
        raceId: race.id,
        teamResult,
      });
    }

    await bumpCacheInvalidationScope(prisma, "player-detail");
    await bumpCacheInvalidationScope(prisma, "competition-detail");
    await finalizeImportBatch(prisma, batch.id, "completed");
    return batch;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeImportBatch(prisma, batch.id, "failed", message);
    throw error;
  }
}
