import { prisma } from "@/lib/prisma";
import { buildPlayerRelations } from "@/lib/player-relations/build-player-relations";
import type { PlayerRelationCachePayload } from "@/lib/player-relations/types";

const CACHE_TTL_MS = 1000 * 60 * 30;

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
    Array.isArray(entry.reasons) && entry.reasons.every((reason) => typeof reason === "object" && reason !== null && "kind" in reason),
  );
}

export async function getPlayerRelations(personId: string) {
  const cached = await prisma.playerRelationCache.findUnique({
    where: { personId },
    select: {
      payload: true,
      generatedAt: true,
    },
  });

  if (cached && isFresh(cached.generatedAt) && isRelationPayload(cached.payload)) {
    return cached.payload;
  }

  const payload = await buildPlayerRelations(personId);

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

  return payload;
}
