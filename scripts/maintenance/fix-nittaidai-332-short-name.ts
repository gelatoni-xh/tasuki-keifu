import { prisma } from "../lib/prisma";

const slug = "nittaidai-long-distance-meet-332";
const expectedOldShortName = "第332回日体大";
const correctedShortName = "第332回日体大長距離競技会";

async function main() {
  const edition = await prisma.competitionEdition.findUnique({
    where: { slug },
    select: { id: true, officialName: true, shortName: true },
  });

  if (!edition) {
    throw new Error(`Competition edition not found: ${slug}`);
  }

  if (edition.shortName === correctedShortName) {
    console.log(JSON.stringify({ slug, status: "already_correct", shortName: correctedShortName }));
    return;
  }

  if (edition.shortName !== expectedOldShortName) {
    throw new Error(`Unexpected short name for ${slug}: ${edition.shortName ?? "<null>"}`);
  }

  await prisma.competitionEdition.update({
    where: { id: edition.id },
    data: { shortName: correctedShortName },
  });

  console.log(JSON.stringify({ slug, status: "updated", from: edition.shortName, to: correctedShortName }));
}

main().finally(() => prisma.$disconnect());
