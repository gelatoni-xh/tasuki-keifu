import { readFile } from "node:fs/promises";
import path from "node:path";

import { DataStatus } from "@prisma/client";

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

const protectedProfileSlugs = new Set(["asahi-kuroda", "kudo-shinsaku", "kiyoto-hirabayashi"]);
const pbNotes = "第102回箱根駅伝 NTV ページの公認最高タイム摘要。PB の正式確認は後続タスクで再確認。";

function normalizeJa(value: string) {
  return value.replace(/[ 　]/g, "");
}

function extractRunnerBlocks(html: string, leg: number) {
  const start = html.indexOf(`<div class="base-heading-subtitle" data-v-42f0980f>${leg}区 選手一覧</div>`);
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

async function syncLeg(leg: number) {
  const htmlPath = path.resolve(`tmp/hakone-102-leg-${leg}.html`);
  const html = await readFile(htmlPath, "utf8");
  const source = await prisma.source.findUnique({ where: { id: `source-ntv-hakone-102-leg-${leg}` } });
  const race = await prisma.race.findUnique({
    where: { slug: `hakone-ekiden-102-leg-${leg}` },
    include: {
      raceResults: {
        include: {
          person: true,
        },
      },
    },
  });

  if (!race) {
    throw new Error(`Missing race: hakone-ekiden-102-leg-${leg}`);
  }

  const personByJa = new Map(
    race.raceResults.map((result) => [normalizeJa(result.person.displayNameJa), result.person]),
  );

  let updated = 0;
  let skippedProtected = 0;
  let skippedEmpty = 0;

  for (const block of extractRunnerBlocks(html, leg)) {
    const nameMatch = block.match(/<div class="name"[^>]*>([^<]+)<\/div>/);
    const name = nameMatch?.[1];
    if (!name) {
      continue;
    }

    const person = personByJa.get(normalizeJa(name));
    if (!person) {
      continue;
    }

    if (protectedProfileSlugs.has(person.slug)) {
      skippedProtected += 1;
      continue;
    }

    const pbs = extractPbsFromBlock(block);
    if (pbs.length === 0) {
      skippedEmpty += 1;
      continue;
    }

    await prisma.personalBest.deleteMany({ where: { personId: person.id } });
    for (const pb of pbs) {
      await prisma.personalBest.create({
        data: {
          personId: person.id,
          discipline: pb.discipline,
          mark: pb.mark,
          status: DataStatus.pending,
          notes: pbNotes,
          sourceId: source?.id ?? null,
        },
      });
    }

    updated += 1;
  }

  console.log(`leg ${leg}: updated=${updated} skippedProtected=${skippedProtected} skippedEmpty=${skippedEmpty}`);
}

async function main() {
  const legs = process.argv.slice(2).map(Number).filter(Boolean);
  const targetLegs = legs.length > 0 ? legs : [1, 2, 5];

  for (const leg of targetLegs) {
    await syncLeg(leg);
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
