import path from "node:path";

export type HakonePbEntry = {
  discipline: "m5000" | "m10000" | "half_marathon";
  mark: string;
};

const disciplineMap: Record<string, HakonePbEntry["discipline"]> = {
  "5000m": "m5000",
  "10000m": "m10000",
  "ハーフ": "half_marathon",
};

export function normalizeJa(value: string) {
  return value.replace(/[ 　]/g, "");
}

export function buildHakoneSourceId(edition: number, leg: number) {
  return `source-ntv-hakone-${edition}-leg-${leg}`;
}

export function buildHakoneRaceSlug(edition: number, leg: number) {
  return `hakone-ekiden-${edition}-leg-${leg}`;
}

export function buildHakoneBatchKey(edition: number, leg: number, suffix: string) {
  return `hakone-${edition}-leg-${leg}-${suffix}`;
}

export function buildHakoneHtmlPath(edition: number, leg: number) {
  return path.resolve(`tmp/hakone-${edition}-leg-${leg}.html`);
}

export function buildHakonePayloadPath(edition: number, leg: number) {
  return path.resolve(`data/imports/hakone-${edition}-leg-${leg}.json`);
}

export function extractRunnerBlocks(html: string, leg: number) {
  const marker = `<div class="base-heading-subtitle" data-v-42f0980f>${leg}区 選手一覧</div>`;
  const start = html.indexOf(marker);
  const candidateEnds = [
    html.indexOf('<div class="sns-share"', start),
    html.indexOf('<script type="application/json" data-nuxt-data', start),
    html.indexOf("</main>", start),
  ].filter((value) => value !== -1);
  const end = candidateEnds.length > 0 ? Math.min(...candidateEnds) : html.length;
  const section = html.slice(start, end);

  return section
    .split('<div class="item" data-v-42f0980f><a class="team"')
    .slice(1)
    .map((part) => `<a class="team"${part}`);
}

export function extractPbsFromBlock(block: string): HakonePbEntry[] {
  const bestStart = block.indexOf('<div class="title" data-v-42f0980f> 公認最高タイム </div>');
  if (bestStart === -1) {
    return [];
  }

  const bestSection = block.slice(bestStart);
  const results: HakonePbEntry[] = [];
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

  const deduped = new Map<string, HakonePbEntry>();
  for (const pb of results) {
    deduped.set(pb.discipline, pb);
  }

  return [...deduped.values()];
}

export function extractNotesFromBlock(block: string) {
  const tags: string[] = [];
  const rankSectionMatch = block.match(/<div class="rank"[^>]*>([\s\S]*?)<\/div>/);
  const rankSection = rankSectionMatch?.[1] ?? "";

  if (rankSection.includes("区間賞")) {
    tags.push("区間賞");
  }

  if (rankSection.includes("区間新")) {
    tags.push("区間新");
  }

  if (rankSection.includes("OP")) {
    tags.push("OP");
  }

  if (tags.includes("OP")) {
    return "OP";
  }

  const awardTags = tags.filter((tag) => tag === "区間賞" || tag === "区間新");
  return awardTags.length > 0 ? awardTags.join(" / ") : null;
}

export function buildHakonePbNotes(edition: number) {
  return `第${edition}回箱根駅伝 NTV ページの公認最高タイム摘要。PB の正式確認は後続タスクで再確認。`;
}

export function formatEditionLabel(edition: number) {
  return `第${edition}回箱根駅伝`;
}
