import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type PbEntry = {
  discipline: string;
  mark: string;
};

const disciplineMap: Record<string, string> = {
  "5000m": "m5000",
  "10000m": "m10000",
  "ハーフ": "half_marathon",
};

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

async function main() {
  const legs = [3, 4, 6, 7, 8, 9, 10];

  for (const leg of legs) {
    const htmlPath = path.resolve(`tmp/hakone-102-leg-${leg}.html`);
    const payloadPath = path.resolve(`data/imports/hakone-102-leg-${leg}.json`);

    const html = await readFile(htmlPath, "utf8");
    const payload = JSON.parse(await readFile(payloadPath, "utf8"));

    const pbByName = new Map<string, PbEntry[]>();
    for (const block of extractRunnerBlocks(html, leg)) {
      const nameMatch = block.match(/<div class="name"[^>]*>([^<]+)<\/div>/);
      const name = nameMatch?.[1];
      if (!name) {
        continue;
      }

      pbByName.set(normalizeJa(name), extractPbsFromBlock(block));
    }

    payload.entries = payload.entries.map((entry: { displayNameJa: string; pbs: PbEntry[] }) => {
      const pbs = pbByName.get(normalizeJa(entry.displayNameJa)) ?? [];
      return {
        ...entry,
        pbs,
      };
    });

    await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`Updated PB snapshots for leg ${leg}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
