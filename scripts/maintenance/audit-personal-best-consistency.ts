import "dotenv/config";

import { type EventDiscipline } from "@prisma/client";

import { markToMilliseconds } from "../lib/import-utils";
import {
  chooseBestPayloadPersonalBestCandidate,
  loadPayloadPersonalBestCandidates,
  normalizeJaForPayloadKey,
} from "../lib/personal-best-payloads";
import { prisma } from "../lib/prisma";

type PayloadEntry = {
  displayNameJa: string;
  pbs: Array<{
    discipline: EventDiscipline;
    mark: string;
  }>;
};

async function main() {
  const payloadCandidates = await loadPayloadPersonalBestCandidates();

  const people = await prisma.person.findMany({
    where: {
      type: "athlete",
    },
    include: {
      personalBests: {
        include: {
          source: true,
        },
      },
    },
    orderBy: {
      displayNameJa: "asc",
    },
  });

  const report: Array<Record<string, unknown>> = [];

  for (const person of people) {
    const candidateMap = payloadCandidates.get(normalizeJaForPayloadKey(person.displayNameJa));
    if (!candidateMap) {
      continue;
    }

    for (const pb of person.personalBests) {
      const currentMillis = pb.markMillis ?? markToMilliseconds(pb.mark);
      if (currentMillis === null) {
        continue;
      }

      const candidates = candidateMap.get(pb.discipline);
      if (!candidates || candidates.length === 0) {
        continue;
      }

      const bestCandidate = chooseBestPayloadPersonalBestCandidate({ candidates });

      if (!bestCandidate) {
        continue;
      }

      if (pb.mark !== bestCandidate.mark || pb.sourceId !== bestCandidate.sourceId) {
        report.push({
          personSlug: person.slug,
          displayNameJa: person.displayNameJa,
          discipline: pb.discipline,
          currentMark: pb.mark,
          currentSource: pb.source?.id ?? null,
          currentStatus: pb.status,
          candidateBestMark: bestCandidate.mark,
          candidateFrom: bestCandidate.label ?? null,
          deltaMs: currentMillis - bestCandidate.markMillis,
          issue: "not_matching_latest_payload",
        });
      } else if (pb.status === "conflicting") {
        report.push({
          personSlug: person.slug,
          displayNameJa: person.displayNameJa,
          discipline: pb.discipline,
          currentMark: pb.mark,
          currentSource: pb.source?.id ?? null,
          currentStatus: pb.status,
          candidateBestMark: bestCandidate.mark,
          candidateFrom: bestCandidate.label ?? null,
          deltaMs: currentMillis - bestCandidate.markMillis,
          issue: "conflicting_status",
        });
      }
    }
  }

  console.log(JSON.stringify({
    checkedPeople: people.length,
    findings: report.length,
    report,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
