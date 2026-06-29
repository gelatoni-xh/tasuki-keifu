import { AuditAction, AuditActorType, AuditReasonType, DataStatus, MembershipType, type PrismaClient } from "@prisma/client";

import type { RaceImportPayload } from "./import-types";

function normalizeJaName(value: string) {
  return value.replace(/[ 　]/g, "");
}

function normalizeRoman(value: string) {
  return value
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reverseRomanOrder(value: string) {
  const parts = normalizeRoman(value).split(" ").filter(Boolean);

  if (parts.length < 2) {
    return normalizeRoman(value);
  }

  return parts.slice().reverse().join(" ");
}

function academicDatesForGrade(grade: number) {
  const universityStartYear = 2026 - grade;

  return {
    highSchoolStart: new Date(`${universityStartYear - 3}-04-01`),
    highSchoolEnd: new Date(`${universityStartYear}-03-31`),
    universityStart: new Date(`${universityStartYear}-04-01`),
    universityEnd: new Date(`${universityStartYear + 4}-03-31`),
  };
}

export async function createOrStartImportBatch(prisma: PrismaClient, payload: RaceImportPayload) {
  return prisma.importBatch.upsert({
    where: { key: payload.batchKey },
    update: {
      type: "race",
      sourceId: payload.sourceId,
      summary: payload.summary,
      payload,
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      errorMessage: null,
    },
    create: {
      key: payload.batchKey,
      type: "race",
      sourceId: payload.sourceId,
      summary: payload.summary,
      payload,
      status: "running",
      startedAt: new Date(),
    },
  });
}

export async function finalizeImportBatch(prisma: PrismaClient, batchId: string, status: "completed" | "failed", errorMessage?: string) {
  return prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status,
      completedAt: new Date(),
      errorMessage: errorMessage ?? null,
    },
  });
}

export async function writeAuditLog(prisma: PrismaClient, input: {
  entityType: string;
  entityId: string;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  sourceId?: string;
  batchId: string;
  reasonNote: string;
}) {
  return prisma.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: AuditAction.update,
      fieldName: input.fieldName,
      oldValue: input.oldValue as never,
      newValue: input.newValue as never,
      reasonType: AuditReasonType.import,
      reasonNote: input.reasonNote,
      sourceId: input.sourceId,
      actorType: AuditActorType.import_script,
      batchId: input.batchId,
    },
  });
}

export async function validateRaceImportDuplicates(prisma: PrismaClient, entries: RaceImportPayload["entries"]) {
  const seenByNormalizedJa = new Map<string, string>();
  const seenByRoman = new Map<string, string>();

  for (const entry of entries) {
    const normalizedJa = normalizeJaName(entry.displayNameJa);
    const normalizedRoman = normalizeRoman(entry.displayNameRoman);
    const reversedRoman = reverseRomanOrder(entry.displayNameRoman);

    const jaSeenSlug = seenByNormalizedJa.get(normalizedJa);
    if (jaSeenSlug && jaSeenSlug !== entry.slug) {
      throw new Error(
        `Duplicate payload person by Japanese name: ${entry.displayNameJa} (${jaSeenSlug} / ${entry.slug})`,
      );
    }
    seenByNormalizedJa.set(normalizedJa, entry.slug);

    const romanSeenSlug = seenByRoman.get(normalizedRoman);
    if (romanSeenSlug && romanSeenSlug !== entry.slug) {
      throw new Error(
        `Duplicate payload person by romanized name: ${entry.displayNameRoman} (${romanSeenSlug} / ${entry.slug})`,
      );
    }
    seenByRoman.set(normalizedRoman, entry.slug);

    const conflictingPeople = await prisma.person.findMany({
      where: {
        slug: { not: entry.slug },
        OR: [
          { displayNameJa: entry.displayNameJa },
          { displayNameRoman: entry.displayNameRoman },
        ],
      },
      select: {
        slug: true,
        displayNameJa: true,
        displayNameRoman: true,
      },
    });

    const normalizedJaConflicts = conflictingPeople.filter(
      (person) => normalizeJaName(person.displayNameJa) === normalizedJa,
    );

    if (normalizedJaConflicts.length > 0) {
      throw new Error(
        `Duplicate person detected by Japanese name: ${entry.displayNameJa} -> existing slugs ${normalizedJaConflicts
          .map((person) => person.slug)
          .join(", ")}`,
      );
    }

    const romanConflicts = conflictingPeople.filter((person) => {
      if (!person.displayNameRoman) {
        return false;
      }

      const existingRoman = normalizeRoman(person.displayNameRoman);

      return existingRoman === normalizedRoman || existingRoman === reversedRoman;
    });

    if (romanConflicts.length > 0) {
      throw new Error(
        `Duplicate person detected by romanized name order: ${entry.displayNameRoman} -> existing slugs ${romanConflicts
          .map((person) => `${person.slug}(${person.displayNameRoman ?? "-"})`)
          .join(", ")}`,
      );
    }
  }
}

export async function upsertRaceEntry(prisma: PrismaClient, input: {
  batchId: string;
  sourceId: string;
  raceId: string;
  pbNotes: string;
  protectedProfileSlugs: Set<string>;
  entry: RaceImportPayload["entries"][number];
}) {
  const university = await prisma.organization.findUnique({
    where: { slug: input.entry.universitySlug },
  });
  const highSchool = await prisma.organization.findUnique({
    where: { slug: input.entry.highSchoolSlug },
  });

  if (!university || !highSchool) {
    throw new Error(`Missing organization for ${input.entry.displayNameJa}`);
  }

  const isCompetitionOnlyTeam = input.entry.universitySlug === "kanto-student-union";

  const person = await prisma.person.upsert({
    where: { slug: input.entry.slug },
    update: {
      displayNameJa: input.entry.displayNameJa,
      displayNameRoman: input.entry.displayNameRoman,
    },
    create: {
      slug: input.entry.slug,
      displayNameJa: input.entry.displayNameJa,
      displayNameRoman: input.entry.displayNameRoman,
      type: "athlete",
      status: DataStatus.pending,
    },
  });

  const dates = academicDatesForGrade(input.entry.grade);

  if (!input.protectedProfileSlugs.has(input.entry.slug) && !isCompetitionOnlyTeam) {
    await prisma.membership.deleteMany({ where: { personId: person.id } });
    await prisma.membership.createMany({
      data: [
        {
          personId: person.id,
          organizationId: university.id,
          type: MembershipType.enrolled,
          startDate: dates.universityStart,
          endDate: dates.universityEnd,
          startYear: dates.universityStart.getFullYear(),
          endYear: dates.universityEnd.getFullYear(),
          grade: input.entry.grade,
          status: DataStatus.pending,
          sourceId: input.sourceId,
        },
        {
          personId: person.id,
          organizationId: highSchool.id,
          type: MembershipType.enrolled,
          startDate: dates.highSchoolStart,
          endDate: dates.highSchoolEnd,
          startYear: dates.highSchoolStart.getFullYear(),
          endYear: dates.highSchoolEnd.getFullYear(),
          status: DataStatus.pending,
          sourceId: input.sourceId,
        },
      ],
    });
  } else if (isCompetitionOnlyTeam) {
    await prisma.membership.deleteMany({ where: { personId: person.id } });
    await prisma.membership.create({
      data: {
        personId: person.id,
        organizationId: highSchool.id,
        type: MembershipType.enrolled,
        startDate: dates.highSchoolStart,
        endDate: dates.highSchoolEnd,
        startYear: dates.highSchoolStart.getFullYear(),
        endYear: dates.highSchoolEnd.getFullYear(),
        status: DataStatus.pending,
        sourceId: input.sourceId,
      },
    });
  }

  if (!input.protectedProfileSlugs.has(input.entry.slug)) {
    await prisma.personalBest.deleteMany({ where: { personId: person.id } });
    for (const pb of input.entry.pbs) {
      await prisma.personalBest.create({
        data: {
          personId: person.id,
          discipline: pb.discipline as never,
          mark: pb.mark,
          status: DataStatus.pending,
          notes: input.pbNotes,
          sourceId: input.sourceId,
        },
      });
    }
  }

  const previousResult = await prisma.raceResult.findFirst({
    where: {
      personId: person.id,
      raceId: input.raceId,
    },
  });

  await prisma.raceResult.deleteMany({
    where: {
      personId: person.id,
      raceId: input.raceId,
    },
  });

  const raceResult = await prisma.raceResult.create({
    data: {
      personId: person.id,
      organizationId: university.id,
      raceId: input.raceId,
      isEntry: true,
      isStarter: true,
      mark: input.entry.mark,
      rank: input.entry.rank,
      gradeAtRace: input.entry.grade,
      status: DataStatus.pending,
      notes: input.entry.notes,
      sourceId: input.sourceId,
    },
  });

  await prisma.sourceReference.upsert({
    where: {
      sourceId_sourceEntityType_sourceEntityKey: {
        sourceId: input.sourceId,
        sourceEntityType: "person",
        sourceEntityKey: input.entry.sourceEntityKey ?? input.entry.slug,
      },
    },
    update: {
      personId: person.id,
      sourceUrl: input.entry.sourceUrl ?? null,
      metadata: {
        displayNameJa: input.entry.displayNameJa,
        displayNameRoman: input.entry.displayNameRoman,
      },
    },
    create: {
      sourceId: input.sourceId,
      sourceEntityType: "person",
      sourceEntityKey: input.entry.sourceEntityKey ?? input.entry.slug,
      sourceUrl: input.entry.sourceUrl ?? null,
      personId: person.id,
      metadata: {
        displayNameJa: input.entry.displayNameJa,
        displayNameRoman: input.entry.displayNameRoman,
      },
    },
  });

  await writeAuditLog(prisma, {
    entityType: "RaceResult",
    entityId: raceResult.id,
    fieldName: "mark",
    oldValue: previousResult
      ? {
          mark: previousResult.mark,
          rank: previousResult.rank,
          notes: previousResult.notes,
        }
      : null,
    newValue: {
      mark: raceResult.mark,
      rank: raceResult.rank,
      notes: raceResult.notes,
    },
    sourceId: input.sourceId,
    batchId: input.batchId,
    reasonNote: `Imported race entry for ${input.entry.displayNameJa}`,
  });
}
