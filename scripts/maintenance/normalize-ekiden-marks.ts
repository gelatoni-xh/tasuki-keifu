import { prisma } from "../lib/prisma";
import { markToMilliseconds, normalizeMarkToCanonical } from "../lib/import-utils";

async function main() {
  const [teamResults, snapshots, raceResults, personalBests] = await Promise.all([
    prisma.teamCompetitionResult.findMany({
      where: { finalMark: { not: null } },
      select: { id: true, finalMark: true, finalMarkMillis: true },
    }),
    prisma.teamCompetitionLegSnapshot.findMany({
      where: {
        OR: [
          { cumulativeMark: { not: null } },
          { gapFromLeader: { not: null } },
        ],
      },
      select: { id: true, cumulativeMark: true, cumulativeMarkMillis: true, gapFromLeader: true, gapFromLeaderMillis: true },
    }),
    prisma.raceResult.findMany({
      where: { mark: { not: null } },
      select: { id: true, mark: true, markMillis: true },
    }),
    prisma.personalBest.findMany({
      select: { id: true, mark: true, markMillis: true },
    }),
  ]);

  let updatedTeamResults = 0;
  let updatedSnapshots = 0;
  let updatedRaceResults = 0;
  let updatedPersonalBests = 0;

  for (const row of teamResults) {
    const canonical = normalizeMarkToCanonical(row.finalMark);
    const millis = canonical ? markToMilliseconds(canonical) : null;
    if (canonical !== row.finalMark || millis !== row.finalMarkMillis) {
      await prisma.teamCompetitionResult.update({
        where: { id: row.id },
        data: {
          finalMark: canonical,
          finalMarkMillis: millis,
        },
      });
      updatedTeamResults += 1;
    }
  }

  for (const row of snapshots) {
    const cumulativeMark = normalizeMarkToCanonical(row.cumulativeMark);
    const cumulativeMillis = cumulativeMark ? markToMilliseconds(cumulativeMark) : null;
    const gapFromLeader = normalizeMarkToCanonical(row.gapFromLeader);
    const gapMillis = gapFromLeader ? markToMilliseconds(gapFromLeader) : null;

    if (
      cumulativeMark !== row.cumulativeMark ||
      cumulativeMillis !== row.cumulativeMarkMillis ||
      gapFromLeader !== row.gapFromLeader ||
      gapMillis !== row.gapFromLeaderMillis
    ) {
      await prisma.teamCompetitionLegSnapshot.update({
        where: { id: row.id },
        data: {
          cumulativeMark,
          cumulativeMarkMillis: cumulativeMillis,
          gapFromLeader,
          gapFromLeaderMillis: gapMillis,
        },
      });
      updatedSnapshots += 1;
    }
  }

  for (const row of raceResults) {
    const canonical = normalizeMarkToCanonical(row.mark);
    const millis = canonical ? markToMilliseconds(canonical) : null;
    if (canonical !== row.mark || millis !== row.markMillis) {
      await prisma.raceResult.update({
        where: { id: row.id },
        data: {
          mark: canonical ?? row.mark,
          markMillis: millis,
        },
      });
      updatedRaceResults += 1;
    }
  }

  for (const row of personalBests) {
    const canonical = normalizeMarkToCanonical(row.mark);
    const millis = canonical ? markToMilliseconds(canonical) : null;
    if (canonical !== row.mark || millis !== row.markMillis) {
      await prisma.personalBest.update({
        where: { id: row.id },
        data: {
          mark: canonical ?? row.mark,
          markMillis: millis,
        },
      });
      updatedPersonalBests += 1;
    }
  }

  console.log(JSON.stringify({
    updatedTeamResults,
    updatedSnapshots,
    updatedRaceResults,
    updatedPersonalBests,
  }, null, 2));
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
