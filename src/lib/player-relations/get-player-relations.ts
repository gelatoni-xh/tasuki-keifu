import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { buildPlayerRelations } from "@/lib/player-relations/build-player-relations";
import type { PlayerRelationCachePayload } from "@/lib/player-relations/types";

const CACHE_TTL_MS = 1000 * 60 * 30;
const relationLogger = createLogger("player-relation-cache", {
  cache_backend: "postgres_table",
  cache_namespace: "player-relations",
});

function isFresh(generatedAt: Date) {
  return Date.now() - generatedAt.getTime() < CACHE_TTL_MS;
}

function isRelationPayload(value: unknown): value is PlayerRelationCachePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<PlayerRelationCachePayload>;

  if (typeof payload.personId !== "string" || !Array.isArray(payload.topRelations)) {
    return false;
  }

  return payload.topRelations.every((entry) =>
    typeof entry.relatedPersonId === "string" &&
    typeof entry.matchupCount === "number" &&
    typeof entry.rawScore === "number" &&
    typeof entry.displayScore === "number" &&
    typeof entry.stageCount === "number" &&
    typeof entry.hasHeadToHeadDetail === "boolean" &&
    typeof entry.context === "object" &&
    entry.context !== null &&
    typeof entry.labels === "object" &&
    entry.labels !== null &&
    typeof entry.matchupSignals === "object" &&
    entry.matchupSignals !== null,
  );
}

export async function getPlayerRelations(personId: string) {
  const startedAt = Date.now();
  const cached = await prisma.playerRelationCache.findUnique({
    where: { personId },
    select: {
      payload: true,
      generatedAt: true,
    },
  });

  if (cached && isFresh(cached.generatedAt) && isRelationPayload(cached.payload)) {
    relationLogger.info("relation_cache_hit", {
      person_id: personId,
      duration_ms: Date.now() - startedAt,
      ttl_ms: CACHE_TTL_MS,
    });
    return cached.payload;
  }

  relationLogger.info(cached ? "relation_cache_miss" : "relation_cache_miss", {
    person_id: personId,
    cache_state: cached ? "stale_or_invalid" : "empty",
    ttl_ms: CACHE_TTL_MS,
  });

  const recomputeStartedAt = Date.now();
  const payload = await buildPlayerRelations(personId);

  relationLogger.info("relation_cache_recompute", {
    person_id: personId,
    duration_ms: Date.now() - recomputeStartedAt,
    relation_count: payload.topRelations.length,
  });

  try {
    await prisma.playerRelationCache.upsert({
      where: { personId },
      update: {
        payload,
        generatedAt: new Date(payload.generatedAt),
      },
      create: {
        personId,
        payload,
        generatedAt: new Date(payload.generatedAt),
      },
    });
    relationLogger.info("relation_cache_upsert_success", {
      person_id: personId,
      duration_ms: Date.now() - startedAt,
      relation_count: payload.topRelations.length,
    });
  } catch (error) {
    relationLogger.error("relation_cache_upsert_failure", {
      person_id: personId,
      duration_ms: Date.now() - startedAt,
      error,
    });
    throw error;
  }

  return payload;
}
