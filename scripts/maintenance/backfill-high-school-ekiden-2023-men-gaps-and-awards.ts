import { readFile } from "node:fs/promises";
import path from "node:path";

import { OrganizationType } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { buildOrganizationCanonicalKey } from "../lib/organization-normalization";

type Payload = {
  raceSlug: string;
  entries: Array<{
    displayNameJa: string;
    raceOrganizationNameJa: string;
    mark: string;
    rank: number | null;
    notes: string | null;
  }>;
  teamResults: Array<{
    organizationNameJa: string;
    snapshot: {
      leg: number;
      cumulativeMark: string | null;
    };
  }>;
};

function markToMilliseconds(mark: string | null | undefined) {
  if (!mark) {
    return null;
  }

  const [timePart, fractionPart] = mark.split(".");
  const segments = timePart.split(":").map((part) => Number(part));
  if (segments.some((value) => Number.isNaN(value))) {
    return null;
  }

  let milliseconds = 0;
  if (segments.length === 3) {
    milliseconds =
      segments[0] * 60 * 60 * 1000 +
      segments[1] * 60 * 1000 +
      segments[2] * 1000;
  } else if (segments.length === 2) {
    milliseconds = segments[0] * 60 * 1000 + segments[1] * 1000;
  } else {
    return null;
  }

  if (!fractionPart) {
    return milliseconds;
  }

  const fraction = Number(fractionPart.padEnd(3, "0").slice(0, 3));
  return Number.isNaN(fraction) ? milliseconds : milliseconds + fraction;
}

function millisecondsToMark(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function mergeAwardNotes(current: string | null, incoming: string[]) {
  const tokens = new Set(
    (current ?? "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part !== "区間賞" && part !== "区間新"),
  );

  for (const token of incoming) {
    tokens.add(token);
  }

  const ordered: string[] = [];
  if (tokens.delete("区間賞")) {
    ordered.push("区間賞");
  }
  if (tokens.delete("区間新")) {
    ordered.push("区間新");
  }

  return [...ordered, ...tokens].join(" / ") || null;
}

async function main() {
  const baseDir = path.resolve(process.argv[2] ?? "data/imports/high-school-ekiden-2023-men");

  let updatedGapCount = 0;
  let updatedAwardCount = 0;

  for (let leg = 1; leg <= 7; leg += 1) {
    const payloadPath = path.join(baseDir, `national-high-school-ekiden-2023-men-leg-${leg}.json`);
    const payload = JSON.parse(await readFile(payloadPath, "utf8")) as Payload;

    const teamMarks = payload.teamResults
      .map((team) => ({
        slug: team.organizationSlug,
        name: team.organizationNameJa,
        canonicalKey: buildOrganizationCanonicalKey(team.organizationNameJa, OrganizationType.high_school),
        leg: team.snapshot.leg,
        mark: team.snapshot.cumulativeMark,
        millis: markToMilliseconds(team.snapshot.cumulativeMark),
      }))
      .filter((item) => item.millis !== null);

    const leaderMillis = Math.min(...teamMarks.map((item) => item.millis as number));

    const race = await prisma.race.findUnique({
      where: { slug: payload.raceSlug },
      include: {
        raceResults: {
          include: {
            person: true,
            organization: true,
          },
        },
        competitionEdition: {
          include: {
            teamCompetitionResults: {
              include: {
                organization: true,
                legSnapshots: true,
              },
            },
          },
        },
      },
    });

    if (!race) {
      throw new Error(`Missing race ${payload.raceSlug}`);
    }

    for (const team of race.competitionEdition.teamCompetitionResults) {
      const snapshot = team.legSnapshots.find((item) => item.leg === leg);
      const payloadTeam = teamMarks.find((item) =>
        item.leg === leg && (
          item.slug === team.organization.slug ||
          item.name === team.organization.nameJa ||
          item.canonicalKey === buildOrganizationCanonicalKey(team.organization.nameJa, OrganizationType.high_school)
        ),
      );
      if (!snapshot || !payloadTeam || payloadTeam.millis === null) {
        continue;
      }

      const gapMillis = payloadTeam.millis - leaderMillis;
      const nextGap = gapMillis <= 0 ? null : millisecondsToMark(gapMillis);

      if (snapshot.gapFromLeader !== nextGap) {
        await prisma.teamCompetitionLegSnapshot.update({
          where: { id: snapshot.id },
          data: {
            gapFromLeader: nextGap,
            gapFromLeaderMillis: nextGap ? gapMillis : null,
          },
        });
        updatedGapCount += 1;
      }
    }

    const winners = payload.entries.filter((entry) => entry.rank === 1);
    for (const winner of winners) {
      const result = race.raceResults.find(
        (item) =>
          item.person.displayNameJa === winner.displayNameJa &&
          item.organization?.nameJa === winner.raceOrganizationNameJa,
      );
      if (!result) {
        throw new Error(`Missing award target ${winner.displayNameJa} in ${payload.raceSlug}`);
      }

      const awardTokens = ["区間賞"];
      if (winner.notes?.includes("区間新")) {
        awardTokens.push("区間新");
      }

      const nextNotes = mergeAwardNotes(result.notes, awardTokens);
      if (result.notes !== nextNotes) {
        await prisma.raceResult.update({
          where: { id: result.id },
          data: { notes: nextNotes },
        });
        updatedAwardCount += 1;
      }
    }
  }

  console.log(JSON.stringify({ updatedGapCount, updatedAwardCount }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
