import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { type EventDiscipline } from "@prisma/client";

import { raceImportPayloadSchema } from "./import-types";
import {
  chooseBestPersonalBestCandidate,
  markToMilliseconds,
  type PersonalBestCandidate,
  type PersonalBestCandidateSource,
} from "./import-utils";

export type PayloadPersonalBestCandidate = {
  mark: string;
  markMillis: number;
  fileName: string;
  sourceId: string;
  hakoneEdition: number | null;
  hakoneLeg: number | null;
};

export function normalizeJaForPayloadKey(value: string) {
  return value.replace(/[ 　]/g, "");
}

function parseHakoneEditionAndLeg(fileName: string) {
  const matched = fileName.match(/^hakone-(\d+)-leg-(\d+)\.json$/);
  if (!matched) {
    return { hakoneEdition: null, hakoneLeg: null };
  }

  return {
    hakoneEdition: Number(matched[1]),
    hakoneLeg: Number(matched[2]),
  };
}

export async function loadPayloadPersonalBestCandidates() {
  const importDir = path.resolve("data/imports");
  const fileNames = (await readdir(importDir))
    .filter((fileName) => fileName.endsWith(".json") && !fileName.endsWith(".draft.json"))
    .sort();

  const map = new Map<string, Map<EventDiscipline, PayloadPersonalBestCandidate[]>>();

  for (const fileName of fileNames) {
    const fullPath = path.join(importDir, fileName);
    const parsed = raceImportPayloadSchema.parse(JSON.parse(await readFile(fullPath, "utf8")));
    const { hakoneEdition, hakoneLeg } = parseHakoneEditionAndLeg(fileName);

    for (const entry of parsed.entries as Array<{
      displayNameJa: string;
      pbs: Array<{ discipline: EventDiscipline; mark: string }>;
    }>) {
      const personKey = normalizeJaForPayloadKey(entry.displayNameJa);
      const byDiscipline = map.get(personKey) ?? new Map<EventDiscipline, PayloadPersonalBestCandidate[]>();

      for (const pb of entry.pbs) {
        const markMillis = markToMilliseconds(pb.mark);
        if (markMillis === null) {
          continue;
        }

        const list = byDiscipline.get(pb.discipline) ?? [];
        list.push({
          mark: pb.mark,
          markMillis,
          fileName,
          sourceId: parsed.sourceId,
          hakoneEdition,
          hakoneLeg,
        });
        byDiscipline.set(pb.discipline, list);
      }

      map.set(personKey, byDiscipline);
    }
  }

  return map;
}

export function chooseBestPayloadPersonalBestCandidate(input: {
  candidates: PayloadPersonalBestCandidate[];
  sourceById?: Map<string, PersonalBestCandidateSource>;
}) {
  const sorted = [...input.candidates].sort((left, right) => {
    const editionDelta = (right.hakoneEdition ?? -1) - (left.hakoneEdition ?? -1);
    if (editionDelta !== 0) {
      return editionDelta;
    }

    const legDelta = (right.hakoneLeg ?? -1) - (left.hakoneLeg ?? -1);
    if (legDelta !== 0) {
      return legDelta;
    }

    return right.fileName.localeCompare(left.fileName, "ja");
  });

  const selected = sorted[0];
  if (!selected) {
    return null;
  }

  const source = input.sourceById?.get(selected.sourceId) ?? null;

  return {
    mark: selected.mark,
    markMillis: selected.markMillis,
    sourceId: selected.sourceId,
    source,
    label: selected.fileName,
  } satisfies PersonalBestCandidate;
}
