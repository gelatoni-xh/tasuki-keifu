import { readFile, writeFile } from "node:fs/promises";

import {
  type HakonePbEntry as PbEntry,
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

async function main() {
  const edition = Number(process.argv[2]);
  const leg = Number(process.argv[3]);
  const htmlPath = process.argv[4];

  if (!edition || !leg) {
    throw new Error("Usage: tsx scripts/imports/generate-hakone-leg-payload.ts <edition> <leg> [htmlPath]");
  }

  const sourceId = buildHakoneSourceId(edition, leg);
  const raceSlug = buildHakoneRaceSlug(edition, leg);
  const batchKey = buildHakoneBatchKey(edition, leg, new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  const pbNotes = buildHakonePbNotes(edition);

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
        orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!race) {
    throw new Error(`Missing race: ${raceSlug}`);
  }

  const html = await readFile(htmlPath ? htmlPath : buildHakoneHtmlPath(edition, leg), "utf8");

  const pbByName = new Map<string, PbEntry[]>();
  const notesByName = new Map<string, string | null>();
  for (const block of extractRunnerBlocks(html, leg)) {
    const nameMatch = block.match(/<div class="name"[^>]*>([^<]+)<\/div>/);
    const name = nameMatch?.[1];
    if (!name) {
      continue;
    }
    const normalizedName = normalizeJa(name);
    pbByName.set(normalizedName, extractPbsFromBlock(block));
    notesByName.set(normalizedName, extractNotesFromBlock(block));
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
          orderBy: [{ endDate: "desc" }, { startDate: "desc" }, { createdAt: "desc" }],
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
      displayNameJa: normalizeDisplayNameJa(person.displayNameJa),
      displayNameRoman: person.displayNameRoman ?? "",
      universitySlug: result.organization.slug,
      highSchoolSlug: highSchoolMembership.organization.slug,
      grade: result.gradeAtRace ?? 1,
      mark: result.mark ?? "",
      rank: result.rank,
      notes: notesByName.get(normalizeJa(person.displayNameJa)) ?? result.notes,
      pbs: pbByName.get(normalizeJa(person.displayNameJa)) ?? [],
      sourceEntityKey: `ntv-${edition}-leg${leg}-${person.slug}`,
      sourceUrl: source.url ?? undefined,
    });
  }

  const payload = {
    batchKey,
    sourceId,
    raceSlug,
    summary: `${formatEditionLabel(edition)} ${leg}区 NTV 区間ページ導入`,
    pbNotes,
    entries,
  };

  const outputPath = buildHakonePayloadPath(edition, leg);
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
