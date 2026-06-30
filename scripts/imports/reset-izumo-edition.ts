import { prisma } from "../lib/prisma";

function hasDirtyDisplayName(value: string) {
  return /[\uFF65-\uFF9F]/.test(value);
}

function isDisposableGeneratedPerson(slug: string) {
  return slug.startsWith("person-");
}

async function main() {
  const edition = Number(process.argv[2] ?? "36");

  if (!Number.isFinite(edition)) {
    throw new Error("Usage: tsx scripts/imports/reset-izumo-edition.ts <edition>");
  }

  const editionSlug = `izumo-ekiden-${edition}`;
  const editionRecord = await prisma.competitionEdition.findUnique({
    where: { slug: editionSlug },
    select: { id: true },
  });

  if (!editionRecord) {
    throw new Error(`Missing competition edition: ${editionSlug}`);
  }

  const races = await prisma.race.findMany({
    where: { competitionEditionId: editionRecord.id },
    select: {
      id: true,
      raceResults: {
        select: {
          personId: true,
        },
      },
    },
  });

  const raceIds = races.map((race) => race.id);
  const touchedPersonIds = [...new Set(races.flatMap((race) => race.raceResults.map((result) => result.personId)))];

  await prisma.$transaction(async (tx) => {
    if (raceIds.length > 0) {
      await tx.raceResult.deleteMany({
        where: {
          raceId: {
            in: raceIds,
          },
        },
      });
    }

    await tx.teamCompetitionResult.deleteMany({
      where: {
        competitionEditionId: editionRecord.id,
      },
    });

    if (touchedPersonIds.length === 0) {
      return;
    }

    const remainingPeople = await tx.person.findMany({
      where: {
        id: {
          in: touchedPersonIds,
        },
      },
      select: {
        id: true,
        slug: true,
        displayNameJa: true,
        raceResults: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    const deletablePersonIds = remainingPeople
      .filter((person) => hasDirtyDisplayName(person.displayNameJa) || isDisposableGeneratedPerson(person.slug))
      .filter((person) => person.raceResults.length === 0)
      .map((person) => person.id);

    if (deletablePersonIds.length > 0) {
      await tx.person.deleteMany({
        where: {
          id: {
            in: deletablePersonIds,
          },
        },
      });
    }
  });

  console.log(JSON.stringify({
    editionSlug,
    raceCount: races.length,
    priorRaceResultCount: races.reduce((sum, race) => sum + race.raceResults.length, 0),
    touchedPersonCount: touchedPersonIds.length,
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
