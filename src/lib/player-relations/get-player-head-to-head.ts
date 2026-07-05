import { buildPlayerHeadToHead } from "@/lib/player-relations/build-player-head-to-head";
import { getCachedValue } from "@/lib/server-cache";

const HEAD_TO_HEAD_CACHE_TTL_MS = 1000 * 60 * 10;

export async function getPlayerHeadToHead(leftPersonId: string, rightPersonId: string) {
  const pairKey = [leftPersonId, rightPersonId].sort().join(":");

  return getCachedValue(`player:head-to-head:${pairKey}`, HEAD_TO_HEAD_CACHE_TTL_MS, async () =>
    buildPlayerHeadToHead(leftPersonId, rightPersonId),
  );
}
