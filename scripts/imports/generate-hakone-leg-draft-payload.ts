import { readFile, writeFile } from "node:fs/promises";

import { OrganizationType } from "@prisma/client";

import { raceImportPayloadSchema } from "../lib/import-types";
import {
  type HakonePbEntry,
  buildHakoneBatchKey,
  buildHakoneHtmlPath,
  buildHakonePayloadPath,
  buildHakonePbNotes,
  buildHakoneRaceSlug,
  buildHakoneSourceId,
  extractNotesFromBlock,
  extractPbsFromBlock,
  extractRunnerBlocks,
  formatEditionLabel,
  normalizeJa,
} from "../lib/hakone";
import { normalizeDisplayNameJa } from "../lib/name-normalization";
import { prisma } from "../lib/prisma";

function normalizeRoman(value: string) {
  return value
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyRoman(value: string) {
  return normalizeRoman(value).replace(/\s+/g, "-");
}

function reverseRomanDisplayOrder(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 2) {
    return value.trim();
  }

  return parts.slice().reverse().join(" ");
}

const preferredSlugByNormalizedJa = new Map<string, string>([
  [normalizeJa("黒田 朝日"), "asahi-kuroda"],
  [normalizeJa("黒田　朝日"), "asahi-kuroda"],
  [normalizeJa("平林 清澄"), "kiyoto-hirabayashi"],
  [normalizeJa("平林　清澄"), "kiyoto-hirabayashi"],
  [normalizeJa("吉居 駿恭"), "shunkyo-yoshii"],
  [normalizeJa("吉居　駿恭"), "shunkyo-yoshii"],
]);

function normalizeSchoolLabel(value: string) {
  return value
    .replace(/[ 　]/g, "")
    .replace(/^[^・]+・/g, "")
    .replace(/学校高等部/g, "高校")
    .replace(/高等学校/g, "高校")
    .replace(/高等部/g, "高校")
    .replace(/附属/g, "付属")
    .replace(/大學/g, "大学")
    .trim();
}

function extractRank(rankSection: string) {
  if (rankSection.includes("OP")) {
    return null;
  }

  const match = rankSection.match(/区間順位<\/span>\s*([0-9]+)\s*<span/);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function extractMark(block: string) {
  const match = block.match(/区間タイム<\/span>\s*([^<]+)/);
  return match?.[1]?.trim() ?? "";
}

function extractGradeAndSchool(block: string) {
  const match = block.match(/<div class="school"[^>]*><span class="grade"[^>]*>([^<]+)<\/span>([^<]+)<\/div>/);
  const gradeText = match?.[1]?.trim() ?? "";
  const schoolText = match?.[2]?.trim() ?? "";
  const grade = Number(gradeText.replace(/[^0-9]/g, ""));

  return {
    grade: Number.isFinite(grade) && grade > 0 ? grade : 1,
    school: schoolText,
  };
}

function extractRunner(block: string) {
  const teamName = block.match(/<div class="team-name"[^>]*>([^<]+)<\/div>/)?.[1]?.trim() ?? "";
  const rankSection = block.match(/<div class="rank"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  const displayNameJa = block.match(/<div class="name"[^>]*>([^<]+)<\/div>/)?.[1]?.trim() ?? "";
  const displayNameRoman = block.match(/<div class="name-en"[^>]*>([^<]+)<\/div>/)?.[1]?.trim() ?? "";
  const { grade, school } = extractGradeAndSchool(block);

  return {
    teamName,
    rank: extractRank(rankSection),
    mark: extractMark(block),
    displayNameJa,
    displayNameRoman,
    grade,
    highSchoolName: school,
    pbs: extractPbsFromBlock(block),
    notes: extractNotesFromBlock(block),
  };
}

function buildOrganizationAliasMap(
  organizations: Array<{ slug: string; nameJa: string; shortName: string | null }>,
) {
  const map = new Map<string, string>();

  for (const organization of organizations) {
    const candidates = new Set<string>([
      organization.nameJa,
      organization.shortName ?? "",
      organization.nameJa.replace(/大学/g, "大"),
      organization.nameJa.replace(/大學/g, "大"),
      organization.nameJa.replace(/高校/g, "高"),
      organization.nameJa.replace(/高等学校/g, "高"),
      organization.nameJa.replace(/学校高等部/g, "高"),
      organization.nameJa.replace(/附属/g, "付属"),
      organization.nameJa.replace(/東京農業大学第三高校/g, "東農大三高"),
      organization.nameJa.replace(/市立船橋高校/g, "市船橋高"),
      organization.nameJa.replace(/工業高校/g, "工高"),
      organization.nameJa.replace(/実業高校/g, "実高"),
      organization.nameJa.replace(/商業高校/g, "商高"),
      organization.nameJa.replace(/経済高校/g, "経済高"),
      organization.nameJa.replace(/大学第三高校/g, "大三高"),
    ]);

    for (const candidate of candidates) {
      const normalized = normalizeSchoolLabel(candidate);
      if (!normalized) {
        continue;
      }
      if (!map.has(normalized)) {
        map.set(normalized, organization.slug);
      }
    }
  }

  return map;
}

function resolveOrganizationSlug(
  aliasMap: Map<string, string>,
  rawName: string,
  options?: { allowKantoStudentUnion?: boolean },
) {
  const normalized = normalizeSchoolLabel(rawName);
  const candidates = new Set<string>([
    normalized,
    normalized.replace(/高$/, "高校"),
    normalized.replace(/工高$/, "工業高校"),
    normalized.replace(/工業高$/, "工高"),
    normalized.replace(/実高$/, "実業高校"),
    normalized.replace(/商高$/, "商業高校"),
    normalized.replace(/商業高$/, "商高"),
    normalized.replace(/付属高$/, "付高"),
    normalized.replace(/附属高$/, "附高"),
    normalized.replace(/付高$/, "付属高"),
    normalized.replace(/附高$/, "附属高"),
    normalized.replace(/西武学園文理高$/, "西武文理高"),
    normalized.replace(/高知農業高$/, "高知農高"),
    normalized.replace(/東農大三高$/, "東京農業大学第三高校"),
    normalized.replace(/市船橋高$/, "市立船橋高校"),
  ]);

  if (
    options?.allowKantoStudentUnion &&
    (normalized === "関東学生連合" || rawName.includes("関東学生連合"))
  ) {
    candidates.add("関東学生連合");
  }

  for (const candidate of candidates) {
    const slug = aliasMap.get(candidate);
    if (slug) {
      return slug;
    }
  }

  return null;
}

async function resolvePersonSlug(displayNameJa: string, displayNameRoman: string) {
  const normalizedJa = normalizeJa(displayNameJa);
  const normalizedRomanName = normalizeRoman(displayNameRoman);
  const reversedRoman = normalizedRomanName.split(" ").filter(Boolean).reverse().join(" ");
  const reversedRomanDisplay = reverseRomanDisplayOrder(displayNameRoman);

  const preferredSlug = preferredSlugByNormalizedJa.get(normalizedJa);
  if (preferredSlug) {
    return preferredSlug;
  }

  const matchedByJa = await prisma.person.findFirst({
    where: {
      OR: [
        { displayNameJa: displayNameJa },
        { displayNameJa: normalizeDisplayNameJa(displayNameJa) },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
    select: { slug: true },
  });
  if (matchedByJa) {
    return matchedByJa.slug;
  }

  const people = await prisma.person.findMany({
    where: {
      OR: [
        { displayNameRoman: { equals: displayNameRoman, mode: "insensitive" } },
        { displayNameRoman: { equals: reversedRomanDisplay, mode: "insensitive" } },
        { displayNameJa: displayNameJa },
        { displayNameJa: normalizeDisplayNameJa(displayNameJa) },
      ],
    },
    select: { slug: true, displayNameJa: true, displayNameRoman: true },
  });

  const matched = people.find((person) => {
    if (normalizeJa(person.displayNameJa) === normalizedJa) {
      return true;
    }
    if (!person.displayNameRoman) {
      return false;
    }
    const existingRoman = normalizeRoman(person.displayNameRoman);
    return existingRoman === normalizedRomanName || existingRoman === reversedRoman;
  });

  return matched?.slug ?? slugifyRoman(displayNameRoman);
}

async function main() {
  const edition = Number(process.argv[2]);
  const leg = Number(process.argv[3]);

  if (!edition || !leg) {
    throw new Error("Usage: tsx scripts/imports/generate-hakone-leg-draft-payload.ts <edition> <leg>");
  }

  const sourceId = buildHakoneSourceId(edition, leg);
  const raceSlug = buildHakoneRaceSlug(edition, leg);
  const batchKey = buildHakoneBatchKey(edition, leg, `draft-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`);
  const htmlPath = buildHakoneHtmlPath(edition, leg);

  const [source, race, html] = await Promise.all([
    prisma.source.findUnique({ where: { id: sourceId } }),
    prisma.race.findUnique({ where: { slug: raceSlug } }),
    readFile(htmlPath, "utf8"),
  ]);

  if (!source) {
    throw new Error(`Missing source: ${sourceId}`);
  }
  if (!race) {
    throw new Error(`Missing race: ${raceSlug}`);
  }

  const [universities, highSchools] = await Promise.all([
    prisma.organization.findMany({
      where: { type: { in: [OrganizationType.university, OrganizationType.federation] } },
      select: { slug: true, nameJa: true, shortName: true },
    }),
    prisma.organization.findMany({
      where: { type: OrganizationType.high_school },
      select: { slug: true, nameJa: true, shortName: true },
    }),
  ]);

  const universityAliasMap = buildOrganizationAliasMap(universities);
  const highSchoolAliasMap = buildOrganizationAliasMap(highSchools);

  const entries = [];
  const missingUniversityNames = new Set<string>();
  const missingHighSchoolNames = new Set<string>();

  for (const block of extractRunnerBlocks(html, leg)) {
    const runner = extractRunner(block);
    if (!runner.displayNameJa || !runner.displayNameRoman || !runner.teamName || !runner.mark) {
      continue;
    }

    const universitySlug = resolveOrganizationSlug(universityAliasMap, runner.teamName, {
      allowKantoStudentUnion: true,
    });
    const highSchoolSlug = resolveOrganizationSlug(highSchoolAliasMap, runner.highSchoolName);

    if (!universitySlug) {
      missingUniversityNames.add(runner.teamName);
    }
    if (!highSchoolSlug) {
      missingHighSchoolNames.add(runner.highSchoolName);
    }

    const slug = await resolvePersonSlug(runner.displayNameJa, runner.displayNameRoman);

    entries.push({
      slug,
      displayNameJa: normalizeDisplayNameJa(runner.displayNameJa),
      displayNameRoman: runner.displayNameRoman,
      universitySlug: universitySlug ?? `missing-university-${slug}`,
      highSchoolSlug: highSchoolSlug ?? `missing-high-school-${slug}`,
      grade: runner.grade,
      mark: runner.mark,
      rank: runner.rank,
      notes: runner.notes,
      pbs: runner.pbs satisfies HakonePbEntry[],
      sourceEntityKey: `ntv-${edition}-leg${leg}-${slug}`,
      sourceUrl: source.url ?? undefined,
    });
  }

  const payload = raceImportPayloadSchema.parse({
    batchKey,
    sourceId,
    raceSlug,
    summary: `${formatEditionLabel(edition)} ${leg}区 NTV 区間ページ draft 導入`,
    pbNotes: buildHakonePbNotes(edition),
    entries,
  });

  const outputPath = buildHakonePayloadPath(edition, leg).replace(/\.json$/, ".draft.json");
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        ...payload,
        _draftMeta: {
          missingUniversityNames: [...missingUniversityNames],
          missingHighSchoolNames: [...missingHighSchoolNames],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        outputPath,
        entries: payload.entries.length,
        missingUniversityNames: [...missingUniversityNames],
        missingHighSchoolNames: [...missingHighSchoolNames],
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
