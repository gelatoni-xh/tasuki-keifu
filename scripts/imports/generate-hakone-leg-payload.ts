import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";

type PbEntry = {
  discipline: "m5000" | "m10000" | "half_marathon";
  mark: string;
};

const disciplineMap: Record<string, PbEntry["discipline"]> = {
  "5000m": "m5000",
  "10000m": "m10000",
  "ハーフ": "half_marathon",
};

const pbNotes = "第102回箱根駅伝 NTV ページの公認最高タイム摘要。PB の正式確認は后续タスクで再確認。";

function normalizeJa(value: string) {
  return value.replace(/[ 　]/g, "");
}

function extractRunnerBlocks(html: string, leg: number) {
  const marker = `<div class="base-heading-subtitle" data-v-42f0980f>${leg}区 選手一覧</div>`;
  const start = html.indexOf(marker);
  const end = html.indexOf('<div class="sns-share"', start);
  const section = html.slice(start, end);

  return section
    .split('<div class="item" data-v-42f0980f><a class="team"')
    .slice(1)
    .map((part) => `<a class="team"${part}`);
}

function extractPbsFromBlock(block: string): PbEntry[] {
  const bestStart = block.indexOf('<div class="title" data-v-42f0980f> 公認最高タイム </div>');
  if (bestStart === -1) {
    return [];
  }

  const bestSection = block.slice(bestStart);
  const results: PbEntry[] = [];
  const matches = bestSection.matchAll(
    /<div class="item" data-v-42f0980f><div class="title" data-v-42f0980f>([^<]+)<\/div><div class="text" data-v-42f0980f>([^<]+)<\/div><\/div>/g,
  );

  for (const match of matches) {
    const rawDiscipline = match[1]?.trim();
    const discipline = disciplineMap[rawDiscipline];
    const mark = match[2]?.trim();

    if (!discipline || !mark) {
      continue;
    }

    results.push({ discipline, mark });
  }

  const deduped = new Map<string, PbEntry>();
  for (const pb of results) {
    deduped.set(pb.discipline, pb);
  }

  return [...deduped.values()];
}

async function main() {
  const leg = Number(process.argv[2]);

  if (!leg) {
    throw new Error("Usage: tsx scripts/imports/generate-hakone-leg-payload.ts <leg>");
  }

  const sourceId = `source-ntv-hakone-102-leg-${leg}`;
  const raceSlug = `hakone-ekiden-102-leg-${leg}`;
  const batchKey = `hakone-102-leg-${leg}-20260629`;

  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error(`Missing source: ${sourceId}`);
  }

  const race = await prisma.race.findUnique({
    where: { slug: raceSlug },
    include: {
      raceResults: {
        include: {
          person: true,
          organization: true,
        },
        orderBy: [
          { rank: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  });

  if (!race) {
    throw new Error(`Missing race: ${raceSlug}`);
  }

  const htmlPath = path.resolve(`tmp/hakone-102-leg-${leg}.html`);
  const html = await readFile(htmlPath, "utf8");

  const pbByName = new Map<string, PbEntry[]>();
  for (const block of extractRunnerBlocks(html, leg)) {
    const nameMatch = block.match(/<div class="name"[^>]*>([^<]+)<\/div>/);
    const name = nameMatch?.[1];
    if (!name) {
      continue;
    }
    pbByName.set(normalizeJa(name), extractPbsFromBlock(block));
  }

  const entries = [];

  for (const result of race.raceResults) {
    const person = await prisma.person.findUnique({
      where: { id: result.personId },
      include: {
        memberships: {
          include: {
            organization: true,
          },
          orderBy: [
            { endDate: "desc" },
            { startDate: "desc" },
            { createdAt: "desc" },
          ],
        },
      },
    });

    if (!person || !result.organization) {
      throw new Error(`Missing linked person or organization for race result ${result.id}`);
    }

    const highSchoolMembership = person.memberships.find((membership) => membership.organization.type === "high_school");
    if (!highSchoolMembership) {
      throw new Error(`Missing high school membership for ${person.slug}`);
    }

    entries.push({
      slug: person.slug,
      displayNameJa: person.displayNameJa,
      displayNameRoman: person.displayNameRoman ?? "",
      universitySlug: result.organization.slug,
      highSchoolSlug: highSchoolMembership.organization.slug,
      grade: result.gradeAtRace ?? 1,
      mark: result.mark ?? "",
      rank: result.rank,
      notes: result.notes,
      pbs: pbByName.get(normalizeJa(person.displayNameJa)) ?? [],
      sourceEntityKey: `ntv-102-leg${leg}-${person.slug}`,
      sourceUrl: source.url ?? undefined,
    });
  }

  const payload = {
    batchKey,
    sourceId,
    raceSlug,
    summary: `第102回箱根駅伝 ${leg}区 NTV 区間ページ导入`,
    pbNotes,
    entries,
  };

  const outputPath = path.resolve(`data/imports/hakone-102-leg-${leg}.json`);
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Generated payload: ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
