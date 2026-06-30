import { AuditAction, AuditActorType, AuditReasonType, DataStatus, MembershipType, type PrismaClient } from "@prisma/client";

import type { RaceImportPayload } from "./import-types";
import { normalizeDisplayNameJa } from "./name-normalization";

function normalizeJaName(value: string) {
  return normalizeDisplayNameJa(value).replace(/ /g, "");
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

function getAcademicYearEndYear(referenceDate: Date) {
  const month = referenceDate.getUTCMonth() + 1;
  const year = referenceDate.getUTCFullYear();

  return month >= 4 ? year + 1 : year;
}

function academicDatesForGrade(grade: number, referenceDate: Date) {
  const academicYearEndYear = getAcademicYearEndYear(referenceDate);
  const universityStartYear = academicYearEndYear - grade;

  return {
    highSchoolStart: new Date(`${universityStartYear - 3}-04-01`),
    highSchoolEnd: new Date(`${universityStartYear}-03-31`),
    universityStart: new Date(`${universityStartYear}-04-01`),
    universityEnd: new Date(`${universityStartYear + 4}-03-31`),
  };
}

export function markToMilliseconds(mark: string) {
  const normalized = mark.trim();

  if (!normalized) {
    return null;
  }

  const [timePart, fractionPart] = normalized.split(".");
  const segments = timePart.split(":").map((part) => Number(part));

  if (segments.some((value) => Number.isNaN(value))) {
    return null;
  }

  let milliseconds = 0;
  if (segments.length === 3) {
    milliseconds =
      segments[0] * 60 * 60 * 1000 +
      segments[1] * 60 * 1000 +
      segments[2] * 1000;
  } else if (segments.length === 2) {
    milliseconds = segments[0] * 60 * 1000 + segments[1] * 1000;
  } else if (segments.length === 1) {
    milliseconds = segments[0] * 1000;
  } else {
    return null;
  }

  if (!fractionPart) {
    return milliseconds;
  }

  const fraction = fractionPart.padEnd(3, "0").slice(0, 3);
  const fractionValue = Number(fraction);

  return Number.isNaN(fractionValue) ? milliseconds : milliseconds + fractionValue;
}

export type PersonalBestCandidateSource = {
  id: string;
  reliability: number;
  publishedOn: Date | null;
  accessedOn: Date | null;
  createdAt: Date;
};

export type PersonalBestCandidate = {
  mark: string;
  markMillis: number;
  sourceId: string;
  source: PersonalBestCandidateSource | null;
  label?: string;
};

function resolveSourceRecency(source: {
  publishedOn: Date | null;
  accessedOn: Date | null;
  createdAt: Date;
} | null | undefined) {
  return source?.publishedOn ?? source?.accessedOn ?? source?.createdAt ?? null;
}

export function comparePersonalBestCandidates(
  left: PersonalBestCandidate,
  right: PersonalBestCandidate,
) {
  const reliabilityDelta = (left.source?.reliability ?? 0) - (right.source?.reliability ?? 0);
  if (reliabilityDelta !== 0) {
    return reliabilityDelta;
  }

  const leftRecency = resolveSourceRecency(left.source);
  const rightRecency = resolveSourceRecency(right.source);
  const recencyDelta =
    (leftRecency?.getTime() ?? 0) - (rightRecency?.getTime() ?? 0);
  if (recencyDelta !== 0) {
    return recencyDelta;
  }

  return right.markMillis - left.markMillis;
}

export function chooseBestPersonalBestCandidate(candidates: PersonalBestCandidate[]) {
  return [...candidates].sort((left, right) => comparePersonalBestCandidates(right, left))[0] ?? null;
}

async function ensureMembership(prisma: PrismaClient, input: {
  personId: string;
  organizationId: string;
  type: MembershipType;
  startDate: Date;
  endDate: Date;
  startYear: number;
  endYear: number;
  sourceId: string;
}) {
  const existing = await prisma.membership.findFirst({
    where: {
      personId: input.personId,
      organizationId: input.organizationId,
      type: input.type,
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });

  if (!existing) {
    await prisma.membership.create({
      data: {
        personId: input.personId,
        organizationId: input.organizationId,
        type: input.type,
        role: "athlete",
        startDate: input.startDate,
        endDate: input.endDate,
        startYear: input.startYear,
        endYear: input.endYear,
        status: DataStatus.pending,
        sourceId: input.sourceId,
      },
    });
    return;
  }

  const patch: {
    startDate?: Date;
    endDate?: Date;
    startYear?: number;
    endYear?: number;
    sourceId?: string;
  } = {};

  if (!existing.startDate) {
    patch.startDate = input.startDate;
  }
  if (!existing.endDate) {
    patch.endDate = input.endDate;
  }
  if (!existing.startYear) {
    patch.startYear = input.startYear;
  }
  if (!existing.endYear) {
    patch.endYear = input.endYear;
  }
  if (!existing.sourceId) {
    patch.sourceId = input.sourceId;
  }

  if (Object.keys(patch).length > 0) {
    await prisma.membership.update({
      where: { id: existing.id },
      data: patch,
    });
  }
}

export async function upsertPersonalBestSnapshot(prisma: PrismaClient, input: {
  personId: string;
  discipline: RaceImportPayload["entries"][number]["pbs"][number]["discipline"];
  mark: string;
  notes: string;
  sourceId: string;
}) {
  const incomingMarkMillis = markToMilliseconds(input.mark);
  const incomingSource = await prisma.source.findUnique({
    where: { id: input.sourceId },
    select: {
      id: true,
      reliability: true,
      publishedOn: true,
      accessedOn: true,
      createdAt: true,
    },
  });
  const existing = await prisma.personalBest.findFirst({
    where: {
      personId: input.personId,
      discipline: input.discipline as never,
    },
    include: {
      source: {
        select: {
          id: true,
          reliability: true,
          publishedOn: true,
          accessedOn: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  if (!existing) {
    await prisma.personalBest.create({
      data: {
        personId: input.personId,
        discipline: input.discipline as never,
        mark: input.mark,
        markMillis: incomingMarkMillis,
        status: DataStatus.pending,
        notes: input.notes,
        sourceId: input.sourceId,
      },
    });
    return;
  }

  const existingMarkMillis = existing.markMillis ?? markToMilliseconds(existing.mark);
  const existingSourceReliability = existing.source?.reliability ?? 0;
  const incomingSourceReliability = incomingSource?.reliability ?? 0;
  const reliabilityDelta = incomingSourceReliability - existingSourceReliability;
  const existingRecency = resolveSourceRecency(existing.source);
  const incomingRecency = resolveSourceRecency(incomingSource);
  const recencyDelta =
    existingRecency && incomingRecency
      ? incomingRecency.getTime() - existingRecency.getTime()
      : 0;
  const isIncomingNewer = recencyDelta > 0;
  const isIncomingOlder = recencyDelta < 0;
  const isIncomingFaster =
    incomingMarkMillis !== null &&
    (existingMarkMillis === null || incomingMarkMillis < existingMarkMillis);
  const isIncomingSlower =
    incomingMarkMillis !== null &&
    existingMarkMillis !== null &&
    incomingMarkMillis > existingMarkMillis;

  const shouldReplace =
    isIncomingFaster &&
    (reliabilityDelta > 0 || (reliabilityDelta === 0 && !isIncomingOlder));

  if (!shouldReplace) {
    if (
      (isIncomingSlower && (reliabilityDelta > 0 || (reliabilityDelta === 0 && isIncomingNewer))) ||
      (isIncomingFaster && (reliabilityDelta < 0 || (reliabilityDelta === 0 && isIncomingOlder)))
    ) {
      await prisma.personalBest.update({
        where: { id: existing.id },
        data: {
          status: DataStatus.conflicting,
          notes: [
            existing.notes,
            `conflict: ${input.notes}`,
            `incoming_reliability=${incomingSourceReliability}`,
            `existing_reliability=${existingSourceReliability}`,
            `incoming_recency=${incomingRecency?.toISOString() ?? "unknown"}`,
            `existing_recency=${existingRecency?.toISOString() ?? "unknown"}`,
          ].filter(Boolean).join(" | "),
        },
      });
    }
    return;
  }

  await prisma.personalBest.update({
    where: { id: existing.id },
    data: {
      mark: input.mark,
      markMillis: incomingMarkMillis,
      status: DataStatus.pending,
      notes: input.notes,
      sourceId: input.sourceId,
    },
  });
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
  const race = await prisma.race.findUnique({
    where: { id: input.raceId },
    include: {
      competitionEdition: true,
    },
  });

  if (!race) {
    throw new Error(`Missing race for raceId=${input.raceId}`);
  }

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
  const normalizedDisplayNameJa = normalizeDisplayNameJa(input.entry.displayNameJa);

  const person = await prisma.person.upsert({
    where: { slug: input.entry.slug },
    update: {},
    create: {
      slug: input.entry.slug,
      displayNameJa: normalizedDisplayNameJa,
      displayNameRoman: input.entry.displayNameRoman,
      type: "athlete",
      status: DataStatus.pending,
    },
  });

  const referenceDate =
    race.startsAt ??
    race.competitionEdition.startsOn ??
    new Date(`${race.competitionEdition.year}-01-01T00:00:00.000Z`);
  const dates = academicDatesForGrade(input.entry.grade, referenceDate);

  if (!input.protectedProfileSlugs.has(input.entry.slug) && !isCompetitionOnlyTeam) {
    await ensureMembership(prisma, {
      personId: person.id,
      organizationId: university.id,
      type: MembershipType.enrolled,
      startDate: dates.universityStart,
      endDate: dates.universityEnd,
      startYear: dates.universityStart.getFullYear(),
      endYear: dates.universityEnd.getFullYear(),
      sourceId: input.sourceId,
    });
    await ensureMembership(prisma, {
      personId: person.id,
      organizationId: highSchool.id,
      type: MembershipType.enrolled,
      startDate: dates.highSchoolStart,
      endDate: dates.highSchoolEnd,
      startYear: dates.highSchoolStart.getFullYear(),
      endYear: dates.highSchoolEnd.getFullYear(),
      sourceId: input.sourceId,
    });
  } else if (isCompetitionOnlyTeam) {
    const existingMemberships = await prisma.membership.findMany({
      where: { personId: person.id },
      include: {
        organization: true,
      },
    });

    const hasHighSchoolMembership = existingMemberships.some(
      (membership) =>
        membership.organizationId === highSchool.id &&
        membership.type === MembershipType.enrolled,
    );

    // 関東学生連合 is a temporary race-day representation, not a core timeline organization.
    // Keep the athlete's existing main memberships untouched and only backfill high school if missing.
    if (!hasHighSchoolMembership) {
      await ensureMembership(prisma, {
        personId: person.id,
        organizationId: highSchool.id,
        type: MembershipType.enrolled,
        startDate: dates.highSchoolStart,
        endDate: dates.highSchoolEnd,
        startYear: dates.highSchoolStart.getFullYear(),
        endYear: dates.highSchoolEnd.getFullYear(),
        sourceId: input.sourceId,
      });
    }
  }

  if (!input.protectedProfileSlugs.has(input.entry.slug)) {
    for (const pb of input.entry.pbs) {
      await upsertPersonalBestSnapshot(prisma, {
        personId: person.id,
        discipline: pb.discipline,
        mark: pb.mark,
        notes: input.pbNotes,
        sourceId: input.sourceId,
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
