import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

const AWARDS = [
  {
    raceSlug: "national-high-school-ekiden-2024-men-leg-1",
    winners: [
      { displayNameJa: "鈴木 琉胤", organizationNameJa: "八千代松陰高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2024-men-leg-2",
    winners: [
      { displayNameJa: "ﾌｪﾘｯｸｽ ﾑﾃｨｱﾆ", organizationNameJa: "山梨学院高校", notes: "区間賞 / 区間新" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2024-men-leg-3",
    winners: [
      { displayNameJa: "佐々木 哲", organizationNameJa: "佐久長聖高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2024-men-leg-4",
    winners: [
      { displayNameJa: "野田 顕臣", organizationNameJa: "大牟田高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2024-men-leg-5",
    winners: [
      { displayNameJa: "塚田 虎翼", organizationNameJa: "大牟田高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2024-men-leg-6",
    winners: [
      { displayNameJa: "岸端 悠友", organizationNameJa: "佐久長聖高校", notes: "区間賞" },
      { displayNameJa: "森本 守勇", organizationNameJa: "大牟田高校", notes: "区間賞" },
    ],
  },
  {
    raceSlug: "national-high-school-ekiden-2024-men-leg-7",
    winners: [
      { displayNameJa: "石川 浩輝", organizationNameJa: "佐久長聖高校", notes: "区間賞" },
    ],
  },
] as const;

function isRepresentativeNote(notes: string | null) {
  return notes === "都道府県代表" || notes?.startsWith("地区代表:") === true;
}

async function main() {
  let clearedCount = 0;
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

    for (const result of race.raceResults) {
      if (isRepresentativeNote(result.notes)) {
        await prisma.raceResult.update({
          where: { id: result.id },
          data: { notes: null },
        });
        clearedCount += 1;
      }
    }

    for (const winner of award.winners) {
      const match = race.raceResults.find(
        (result) =>
          result.person.displayNameJa === winner.displayNameJa &&
          result.organization?.nameJa === winner.organizationNameJa,
      );

      if (!match) {
        throw new Error(
          `Missing winner ${winner.displayNameJa} (${winner.organizationNameJa}) in ${award.raceSlug}`,
        );
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

  console.log(
    JSON.stringify(
      {
        clearedCount,
        updatedAwardCount,
        opDetected: false,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
