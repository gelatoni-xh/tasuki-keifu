import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { buildHakoneRaceSlug } from "../lib/hakone";

type OldRecordMap = Record<string, string>;

function markToSeconds(mark: string) {
  const parts = mark.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  throw new Error(`Unsupported mark format: ${mark}`);
}

function buildNotes(input: { existing: string | null; isWinner: boolean; isRecord: boolean }) {
  const tokens = new Set(
    (input.existing ?? "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part !== "区間賞" && part !== "区間新"),
  );

  if (input.isWinner) {
    tokens.add("区間賞");
  }

  if (input.isRecord) {
    tokens.add("区間新");
  }

  const ordered = ["区間賞", "区間新"].filter((token) => tokens.delete(token));
  const others = [...tokens];
  const finalTokens = [...ordered, ...others];

  return finalTokens.length > 0 ? finalTokens.join(" / ") : null;
}

async function main() {
  const edition = Number(process.argv[2]);
  const baselinePath = process.argv[3] ?? path.resolve("data/config/hakone-old-records.json");

  if (!edition) {
    throw new Error("Usage: tsx scripts/maintenance/update-hakone-awards.ts <edition> [baseline.json]");
  }

  const raw = await readFile(baselinePath, "utf8");
  const allBaselines = JSON.parse(raw) as Record<string, OldRecordMap>;
  const oldRecordsByLeg = allBaselines[String(edition)];

  if (!oldRecordsByLeg) {
    throw new Error(`Missing old record baseline for Hakone ${edition}: ${baselinePath}`);
  }

  const races = await prisma.race.findMany({
    where: {
      slug: {
        in: Array.from({ length: 10 }, (_, index) => buildHakoneRaceSlug(edition, index + 1)),
      },
    },
    include: {
      raceResults: {
        include: {
          person: true,
        },
        orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { leg: "asc" },
  });

  for (const race of races) {
    if (!race.leg) {
      continue;
    }

    const oldRecord = oldRecordsByLeg[String(race.leg)];
    if (!oldRecord) {
      continue;
    }

    const oldRecordSeconds = markToSeconds(oldRecord);

    for (const result of race.raceResults) {
      const isWinner = result.rank === 1;
      const isRecord = Boolean(result.mark && result.rank !== null && markToSeconds(result.mark) < oldRecordSeconds);
      const nextNotes = buildNotes({
        existing: result.notes,
        isWinner,
        isRecord,
      });

      await prisma.raceResult.update({
        where: { id: result.id },
        data: { notes: nextNotes },
      });

      if (isWinner || isRecord) {
        console.log(
          JSON.stringify({
            edition,
            leg: race.leg,
            slug: result.person.slug,
            displayNameJa: result.person.displayNameJa,
            rank: result.rank,
            mark: result.mark,
            notes: nextNotes,
          }),
        );
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
