import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

const AWARDS = [
  {
    raceSlug: "national-high-school-ekiden-2023-men-leg-1",
    winners: [
      { displayNameJa: "折田 壮太", organizationNameJa: "須磨学園高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2023-men-leg-2",
    winners: [
      { displayNameJa: "陳内 紫音", organizationNameJa: "小林高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2023-men-leg-3",
    winners: [
      { displayNameJa: "ｻﾑｴﾙ･ｷﾊﾞﾃｨ", organizationNameJa: "倉敷高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2023-men-leg-4",
    winners: [
      { displayNameJa: "桑田 駿介", organizationNameJa: "倉敷高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2023-men-leg-5",
    winners: [
      { displayNameJa: "佐々木 哲", organizationNameJa: "佐久長聖高校", notes: "区間賞 / 区間新" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2023-men-leg-6",
    winners: [
      { displayNameJa: "吉岡 斗真", organizationNameJa: "佐久長聖高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2023-men-leg-7",
    winners: [
      { displayNameJa: "平山 櫂吏", organizationNameJa: "八千代松陰高校", notes: "区間賞" },
    ],
  },
] as const;

async function main() {
  let updatedAwardCount = 0;

  for (const award of AWARDS) {
    const race = await prisma.race.findUnique({
      where: { slug: award.raceSlug },
      include: {
        raceResults: {
          include: {
            person: true,
            organization: true,
          },
        },
      },
    });

    if (!race) {
      throw new Error(`Missing race ${award.raceSlug}`);
    }

    for (const winner of award.winners) {
      const match = race.raceResults.find(
        (result) =>
          result.person.displayNameJa === winner.displayNameJa &&
          result.organization?.nameJa === winner.organizationNameJa,
      );

      if (!match) {
        throw new Error(`Missing winner ${winner.displayNameJa} (${winner.organizationNameJa}) in ${award.raceSlug}`);
      }

      if (match.notes !== winner.notes) {
        await prisma.raceResult.update({
          where: { id: match.id },
          data: { notes: winner.notes },
        });
        updatedAwardCount += 1;
      }
    }
  }

  console.log(JSON.stringify({ updatedAwardCount }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
