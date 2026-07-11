import { createHash } from "node:crypto";

import { AuditAction, AuditActorType, AuditReasonType, DataStatus, MembershipType, OrganizationType, type NameVariantType, type PrismaClient } from "@prisma/client";

import type { RaceImportPayload } from "./import-types";
import { normalizeDisplayNameJa, normalizePersonDisplayNameJa } from "./name-normalization";
import { buildOrganizationCanonicalKey, normalizeOrganizationLabel } from "./organization-normalization";

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

const KNOWN_TRUE_SAME_NAME_SLUG_GROUPS = [
  [
    "nakagawa-takumi-masuda-seifu",
    "person-e4b8ade5b79d20e68b93e6b5",
  ],
  [
    "maeda-hinata-kagoshima-josei",
    "person-e5898de794b020e999bde590",
  ],
  [
    "higuchi-shota-oita-tomei",
    "person-e6a88be58fa320e7bf94e5a4",
  ],
  [
    "person-gmo-internet-group-c754a9bf",
    "person-jiic2021-imae-yuto-chiba-university",
  ],
  [
    "person-kao-1e46847f",
    "person-kao-1e84de92",
  ],
  [
    "person-jusic2021-e69c8de983a8e587b1e69d8f",
    "hattori-kaishin",
  ],
  [
    "person-hokuren2026abashiri-e58685e794b0e8b3a2e588a9",
    "uchida-kento",
  ],
  [
    "person-e988b4e69ca820e5a4a7e7bf",
    "person-kao-0dbf5ba9",
  ],
] as const;

const KNOWN_TRUE_SAME_NAME_SLUG_PAIRS = new Set(
  KNOWN_TRUE_SAME_NAME_SLUG_GROUPS.flatMap((group) =>
    group.flatMap((left) => group.filter((right) => right !== left).map((right) => `${left}::${right}`)),
  ),
);

function isKnownTrueSameNameSlugPair(leftSlug: string, rightSlug: string) {
  return KNOWN_TRUE_SAME_NAME_SLUG_PAIRS.has(`${leftSlug}::${rightSlug}`);
}

function slugifyFallback(value: string) {
  const ascii = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

  if (ascii) {
    return ascii;
  }

  return createHash("sha1").update(value.normalize("NFKC")).digest("hex").slice(0, 12);
}

function getAcademicYearEndYear(referenceDate: Date) {
  const month = referenceDate.getUTCMonth() + 1;
  const year = referenceDate.getUTCFullYear();

  return month >= 4 ? year + 1 : year;
}

function getAcademicYearStartYear(referenceDate: Date) {
  const month = referenceDate.getUTCMonth() + 1;
  const year = referenceDate.getUTCFullYear();

  return month >= 4 ? year : year - 1;
}

function academicDatesForUniversityGrade(grade: number, referenceDate: Date) {
  const academicYearEndYear = getAcademicYearEndYear(referenceDate);
  const universityStartYear = academicYearEndYear - grade;

  return {
    highSchoolStart: new Date(`${universityStartYear - 3}-04-01`),
    highSchoolEnd: new Date(`${universityStartYear}-03-31`),
    universityStart: new Date(`${universityStartYear}-04-01`),
    universityEnd: new Date(`${universityStartYear + 4}-03-31`),
  };
}

function academicDatesForHighSchoolGrade(grade: number, referenceDate: Date) {
  const academicYearEndYear = getAcademicYearEndYear(referenceDate);
  const highSchoolEndYear = academicYearEndYear + (3 - grade);

  return {
    highSchoolStart: new Date(`${highSchoolEndYear - 3}-04-01`),
    highSchoolEnd: new Date(`${highSchoolEndYear}-03-31`),
  };
}

function academicDatesForJuniorHighSchoolGrade(grade: number, referenceDate: Date) {
  const academicYearEndYear = getAcademicYearEndYear(referenceDate);
  const juniorHighSchoolEndYear = academicYearEndYear + (3 - grade);

  return {
    juniorHighSchoolStart: new Date(`${juniorHighSchoolEndYear - 3}-04-01`),
    juniorHighSchoolEnd: new Date(`${juniorHighSchoolEndYear}-03-31`),
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function inferHighSchoolWindowFromUniversityStart(universityStartDate: Date) {
  const universityStartYear = getAcademicYearStartYear(universityStartDate);

  return {
    highSchoolStart: new Date(Date.UTC(universityStartYear - 3, 3, 1)),
    highSchoolEnd: new Date(Date.UTC(universityStartYear, 2, 31)),
  };
}

function inferUniversityWindowFromCorporateStart(corporateStartDate: Date) {
  const corporateAcademicStartYear = getAcademicYearStartYear(corporateStartDate);

  return {
    universityStart: new Date(Date.UTC(corporateAcademicStartYear - 4, 3, 1)),
    universityEnd: new Date(Date.UTC(corporateAcademicStartYear, 2, 31)),
  };
}

function getMembershipAcademicStartDate(membership: {
  startDate: Date | null;
  startYear: number | null;
}) {
  if (membership.startDate) {
    return membership.startDate;
  }

  if (membership.startYear) {
    return new Date(Date.UTC(membership.startYear, 3, 1));
  }

  return null;
}

function getMembershipAcademicEndDate(membership: {
  endDate: Date | null;
  endYear: number | null;
}) {
  if (membership.endDate) {
    return membership.endDate;
  }

  if (membership.endYear) {
    return new Date(Date.UTC(membership.endYear, 2, 31));
  }

  return null;
}

function windowsOverlap(
  first: {
    startDate: Date | null;
    endDate: Date | null;
    startYear: number | null;
    endYear: number | null;
  },
  second: {
    startDate: Date | null;
    endDate: Date | null;
    startYear: number | null;
    endYear: number | null;
  },
) {
  const firstStart = getMembershipAcademicStartDate(first);
  const secondStart = getMembershipAcademicStartDate(second);

  if (!firstStart || !secondStart) {
    return null;
  }

  const firstEnd = getMembershipAcademicEndDate(first) ?? new Date(Date.UTC(9999, 11, 31));
  const secondEnd = getMembershipAcademicEndDate(second) ?? new Date(Date.UTC(9999, 11, 31));

  return firstStart <= secondEnd && secondStart <= firstEnd;
}

export async function canApplyInferredMembershipWindow(prisma: PrismaClient, input: {
  personId: string;
  membershipId?: string | null;
  organizationType: OrganizationType;
  membershipType: MembershipType;
  startDate: Date | null;
  endDate: Date | null;
  startYear: number | null;
  endYear: number | null;
}) {
  const candidateStart = getMembershipAcademicStartDate(input);

  if (!candidateStart) {
    return {
      allowed: false as const,
      reason: "missing_candidate_start",
    };
  }

  const sameStageMemberships = await prisma.membership.findMany({
    where: {
      personId: input.personId,
      type: input.membershipType,
      ...(input.membershipId ? { id: { not: input.membershipId } } : {}),
      organization: {
        type: input.organizationType,
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          slug: true,
          nameJa: true,
          type: true,
        },
      },
    },
  });

  for (const membership of sameStageMemberships) {
    const otherStart = getMembershipAcademicStartDate(membership);
    const otherEnd = getMembershipAcademicEndDate(membership);

    if (!otherStart && !otherEnd) {
      return {
        allowed: false as const,
        reason: "conflict_unknown_period",
        conflictMembership: membership,
      };
    }

    const overlap = windowsOverlap(input, membership);
    if (overlap) {
      return {
        allowed: false as const,
        reason: "conflict_overlap",
        conflictMembership: membership,
      };
    }
  }

  return {
    allowed: true as const,
  };
}

function deriveAcademicDatesForEntry(input: {
  grade: number;
  referenceDate: Date;
  raceOrganizationType: RaceImportPayload["entries"][number]["raceOrganizationType"];
}) {
  if (input.raceOrganizationType === "junior_high_school") {
    const juniorHighSchoolDates = academicDatesForJuniorHighSchoolGrade(input.grade, input.referenceDate);
    return {
      highSchoolStart: null,
      highSchoolEnd: null,
      universityStart: null,
      universityEnd: null,
      juniorHighSchoolStart: juniorHighSchoolDates.juniorHighSchoolStart,
      juniorHighSchoolEnd: juniorHighSchoolDates.juniorHighSchoolEnd,
    };
  }

  if (input.raceOrganizationType === "high_school") {
    const highSchoolDates = academicDatesForHighSchoolGrade(input.grade, input.referenceDate);
    return {
      ...highSchoolDates,
      universityStart: null,
      universityEnd: null,
      juniorHighSchoolStart: null,
      juniorHighSchoolEnd: null,
    };
  }

  const universityDates = academicDatesForUniversityGrade(input.grade, input.referenceDate);
  return {
    ...universityDates,
    juniorHighSchoolStart: null,
    juniorHighSchoolEnd: null,
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

export function normalizeMarkToCanonical(mark: string | null | undefined) {
  if (!mark) {
    return null;
  }

  const normalized = mark
    .trim()
    .replace(/\s+/g, "")
    .replace(/：/g, ":")
    .replace(/．/g, ".");

  if (!normalized) {
    return null;
  }

  if (/^\d+(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(normalized)) {
    const [timePart, fractionPart] = normalized.split(".");
    const segments = timePart.split(":").map((segment) => Number(segment));

    if (segments.some((segment) => Number.isNaN(segment))) {
      return normalized;
    }

    if (segments.length === 3) {
      const [hours, minutes, seconds] = segments;
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${fractionPart ? `.${fractionPart}` : ""}`;
    }

    if (segments.length === 2) {
      const [minutes, seconds] = segments;
      return `${minutes}:${String(seconds).padStart(2, "0")}${fractionPart ? `.${fractionPart}` : ""}`;
    }

    return `${segments[0]}${fractionPart ? `.${fractionPart}` : ""}`;
  }

  const jpMatch = normalized.match(/^(?:(\d+)時間)?(?:(\d+)分)?(?:(\d+)秒)?(?:\.(\d+))?$/);
  if (!jpMatch) {
    return normalized;
  }

  const hours = Number(jpMatch[1] ?? 0);
  const minutes = Number(jpMatch[2] ?? 0);
  const seconds = Number(jpMatch[3] ?? 0);
  const fraction = jpMatch[4] ?? null;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${fraction ? `.${fraction}` : ""}`;
  }

  if (jpMatch[2] || jpMatch[3]) {
    return `${minutes}:${String(seconds).padStart(2, "0")}${fraction ? `.${fraction}` : ""}`;
  }

  return normalized;
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

export async function ensureMembership(prisma: PrismaClient, input: {
  personId: string;
  organizationId: string;
  type: MembershipType;
  startDate: Date | null;
  endDate: Date | null;
  startYear: number | null;
  endYear: number | null;
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
    startDate?: Date | null;
    endDate?: Date | null;
    startYear?: number | null;
    endYear?: number | null;
    sourceId?: string;
  } = {};

  if (!existing.startDate && input.startDate) {
    patch.startDate = input.startDate;
  }
  if (!existing.endDate && input.endDate) {
    patch.endDate = input.endDate;
  }
  if (!existing.startYear && input.startYear) {
    patch.startYear = input.startYear;
  }
  if (!existing.endYear && input.endYear) {
    patch.endYear = input.endYear;
  }
  if (!existing.sourceId) {
    patch.sourceId = input.sourceId;
  }

  const sameTimeline =
    (existing.startDate?.toISOString() ?? null) === (input.startDate?.toISOString() ?? null) &&
    (existing.endDate?.toISOString() ?? null) === (input.endDate?.toISOString() ?? null) &&
    (existing.startYear ?? null) === input.startYear &&
    (existing.endYear ?? null) === input.endYear;

  if (!sameTimeline) {
    if (input.startDate) {
      patch.startDate = input.startDate;
    }
    if (input.endDate) {
      patch.endDate = input.endDate;
    }
    if (input.startYear) {
      patch.startYear = input.startYear;
    }
    if (input.endYear) {
      patch.endYear = input.endYear;
    }
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
  const canonicalMark = normalizeMarkToCanonical(input.mark) ?? input.mark;
  const incomingMarkMillis = markToMilliseconds(canonicalMark);
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
        mark: canonicalMark,
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
      mark: canonicalMark,
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
    const normalizedRoman = entry.displayNameRoman ? normalizeRoman(entry.displayNameRoman) : null;
    const reversedRoman = entry.displayNameRoman ? reverseRomanOrder(entry.displayNameRoman) : null;

    const jaSeenSlug = seenByNormalizedJa.get(normalizedJa);
    if (jaSeenSlug && jaSeenSlug !== entry.slug) {
      throw new Error(
        `Duplicate payload person by Japanese name: ${entry.displayNameJa} (${jaSeenSlug} / ${entry.slug})`,
      );
    }
    seenByNormalizedJa.set(normalizedJa, entry.slug);

    if (normalizedRoman) {
      const romanSeenSlug = seenByRoman.get(normalizedRoman);
      if (romanSeenSlug && romanSeenSlug !== entry.slug) {
        throw new Error(
          `Duplicate payload person by romanized name: ${entry.displayNameRoman} (${romanSeenSlug} / ${entry.slug})`,
        );
      }
      seenByRoman.set(normalizedRoman, entry.slug);
    }

    const conflictingPeople = await prisma.person.findMany({
      where: {
        slug: { not: entry.slug },
        OR: [
          { displayNameJa: entry.displayNameJa },
          ...(entry.displayNameRoman ? [{ displayNameRoman: entry.displayNameRoman }] : []),
        ],
      },
      select: {
        slug: true,
        displayNameJa: true,
        displayNameRoman: true,
        memberships: {
          select: {
            organization: {
              select: {
                slug: true,
                type: true,
              },
            },
          },
        },
        raceResults: {
          where: {
            organizationId: { not: null },
          },
          select: {
            organization: {
              select: {
                slug: true,
                type: true,
              },
            },
          },
        },
      },
    });

    const normalizedJaConflicts = conflictingPeople.filter(
      (person) => normalizeJaName(person.displayNameJa) === normalizedJa && person.slug !== entry.slug,
    );

    const allowedSameNameSchoolMismatches = normalizedJaConflicts.filter((person) => {
      if (!entry.highSchoolSlug) {
        return false;
      }

      const personHighSchoolSlugs = new Set(
        person.memberships
          .filter((membership) => membership.organization.type === OrganizationType.high_school)
          .map((membership) => membership.organization.slug),
      );
      const personRaceSchoolSlugs = new Set(
        person.raceResults
          .filter((result) => result.organization?.type === OrganizationType.high_school)
          .map((result) => result.organization?.slug)
          .filter((slug): slug is string => Boolean(slug)),
      );

      const knownSchoolSlugs = new Set([...personHighSchoolSlugs, ...personRaceSchoolSlugs]);
      return knownSchoolSlugs.size > 0 && !knownSchoolSlugs.has(entry.highSchoolSlug);
    });
    const allowedSameNameUniversityMismatches = normalizedJaConflicts.filter((person) => {
      if (!entry.universitySlug) {
        return false;
      }

      const personUniversitySlugs = new Set(
        person.memberships
          .filter((membership) => membership.organization.type === OrganizationType.university)
          .map((membership) => membership.organization.slug),
      );
      const personRaceUniversitySlugs = new Set(
        person.raceResults
          .filter((result) => result.organization?.type === OrganizationType.university)
          .map((result) => result.organization?.slug)
          .filter((slug): slug is string => Boolean(slug)),
      );

      const knownUniversitySlugs = new Set([...personUniversitySlugs, ...personRaceUniversitySlugs]);
      return knownUniversitySlugs.size > 0 && !knownUniversitySlugs.has(entry.universitySlug);
    });

    const blockingJaConflicts = normalizedJaConflicts.filter(
      (person) =>
        !isKnownTrueSameNameSlugPair(entry.slug, person.slug) &&
        !allowedSameNameSchoolMismatches.some((allowed) => allowed.slug === person.slug) &&
        !allowedSameNameUniversityMismatches.some((allowed) => allowed.slug === person.slug),
    );

    if (blockingJaConflicts.length > 0) {
      throw new Error(
        `Duplicate person detected by Japanese name: ${entry.displayNameJa} -> existing slugs ${blockingJaConflicts
          .map((person) => person.slug)
          .join(", ")}`,
      );
    }

    const romanConflicts = normalizedRoman ? conflictingPeople.filter((person) => {
      if (!person.displayNameRoman) {
        return false;
      }

      const existingRoman = normalizeRoman(person.displayNameRoman);

      return existingRoman === normalizedRoman || existingRoman === reversedRoman;
    }) : [];

    if (romanConflicts.length > 0) {
      throw new Error(
        `Duplicate person detected by romanized name order: ${entry.displayNameRoman} -> existing slugs ${romanConflicts
          .map((person) => `${person.slug}(${person.displayNameRoman ?? "-"})`)
          .join(", ")}`,
      );
    }
  }
}

async function findOrganizationByName(prisma: PrismaClient, input: {
  nameJa: string;
  type?: OrganizationType;
}) {
  const normalizedTarget = normalizeOrganizationLabel(input.nameJa);
  const canonicalTarget = input.type ? buildOrganizationCanonicalKey(input.nameJa, input.type) : null;

  const organizations = await prisma.organization.findMany({
    where: {
      ...(input.type ? { type: input.type } : {}),
    },
    select: {
      id: true,
      slug: true,
      nameJa: true,
      type: true,
      prefecture: true,
    },
  });

  const matchedByPrimaryName = organizations.find(
    (organization) => normalizeOrganizationLabel(organization.nameJa) === normalizedTarget,
  );
  if (matchedByPrimaryName) {
    return matchedByPrimaryName;
  }

  if (canonicalTarget) {
    const matchedByCanonicalKey = organizations.find(
      (organization) => buildOrganizationCanonicalKey(organization.nameJa, organization.type) === canonicalTarget,
    );
    if (matchedByCanonicalKey) {
      return matchedByCanonicalKey;
    }
  }

  const variants = await prisma.nameVariant.findMany({
    where: {
      organizationId: { not: null },
      ...(input.type
        ? {
            organization: {
              type: input.type,
            },
          }
        : {}),
    },
    select: {
      value: true,
      organization: {
        select: {
          id: true,
          slug: true,
          nameJa: true,
          type: true,
          prefecture: true,
        },
      },
    },
  });

  const matchedByVariant = variants.find(
    (variant) =>
      variant.organization &&
      normalizeOrganizationLabel(variant.value) === normalizedTarget,
  );

  if (matchedByVariant?.organization) {
    return matchedByVariant.organization;
  }

  if (canonicalTarget) {
    const matchedByVariantCanonicalKey = variants.find(
      (variant) =>
        variant.organization &&
        buildOrganizationCanonicalKey(variant.value, variant.organization.type) === canonicalTarget,
    );

    if (matchedByVariantCanonicalKey?.organization) {
      return matchedByVariantCanonicalKey.organization;
    }
  }

  return null;
}

async function ensureOrganizationAlias(prisma: PrismaClient, input: {
  organizationId: string;
  alias: string;
  sourceId?: string;
  type?: NameVariantType;
}) {
  const normalizedAlias = normalizeOrganizationLabel(input.alias);
  if (!normalizedAlias) {
    return;
  }

  const existingVariants = await prisma.nameVariant.findMany({
    where: {
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      value: true,
    },
  });

  const hasAlias = existingVariants.some(
    (variant) => normalizeOrganizationLabel(variant.value) === normalizedAlias,
  );

  if (hasAlias) {
    return;
  }

  await prisma.nameVariant.create({
    data: {
      organizationId: input.organizationId,
      value: input.alias,
      type: input.type ?? "media",
      sourceId: input.sourceId,
    },
  });
}

async function ensureOrganization(prisma: PrismaClient, input: {
  slug: string | null | undefined;
  nameJa: string | null | undefined;
  type: OrganizationType;
  prefecture?: string | null | undefined;
  sourceId: string;
}) {
  if (!input.nameJa) {
    return null;
  }

  if (input.slug) {
    const bySlug = await prisma.organization.findUnique({
      where: { slug: input.slug },
      select: {
        id: true,
        slug: true,
        nameJa: true,
        type: true,
        prefecture: true,
      },
    });
    if (bySlug) {
      if (!bySlug.prefecture && input.prefecture) {
        await prisma.organization.update({
          where: { id: bySlug.id },
          data: {
            prefecture: input.prefecture,
          },
        });
      }
      await ensureOrganizationAlias(prisma, {
        organizationId: bySlug.id,
        alias: input.nameJa,
        sourceId: input.sourceId,
      });
      return bySlug.prefecture || !input.prefecture
        ? bySlug
        : { ...bySlug, prefecture: input.prefecture };
    }
  }

  const byName = await findOrganizationByName(prisma, {
    nameJa: input.nameJa,
    type: input.type,
  });
  if (byName) {
    if (!byName.prefecture && input.prefecture) {
      await prisma.organization.update({
        where: { id: byName.id },
        data: {
          prefecture: input.prefecture,
        },
      });
    }
    await ensureOrganizationAlias(prisma, {
      organizationId: byName.id,
      alias: input.nameJa,
      sourceId: input.sourceId,
    });
    return byName.prefecture || !input.prefecture
      ? byName
      : { ...byName, prefecture: input.prefecture };
  }

  const fallbackSlug =
    input.slug ??
    `${input.type === OrganizationType.high_school ? "hs" : "org"}-${slugifyFallback(input.nameJa) || Date.now().toString()}`;

  return prisma.organization.create({
    data: {
      slug: fallbackSlug,
      nameJa: normalizeOrganizationLabel(input.nameJa),
      type: input.type,
      prefecture: input.prefecture ?? null,
      status: DataStatus.pending,
      nameVariants: {
        create: [
          {
            value: input.nameJa,
            type: "official",
            sourceId: input.sourceId,
            isPrimary: true,
          },
        ],
      },
      sourceReferences: {
        create: {
          sourceId: input.sourceId,
          sourceEntityType: "organization",
          sourceEntityKey: fallbackSlug,
          metadata: {
            importedNameJa: input.nameJa,
          },
        },
      },
    },
  });
}

function mapRaceOrganizationType(
  type:
    | "university"
    | "high_school"
    | "junior_high_school"
    | "club"
    | "corporate_team"
    | "company"
    | "prefecture_representative"
    | "student_union_select",
) {
  if (type === "prefecture_representative") {
    return OrganizationType.prefecture_representative;
  }

  if (type === "student_union_select") {
    return OrganizationType.student_union_select;
  }

  if (type === "corporate_team") {
    return OrganizationType.corporate_team;
  }

  if (type === "company") {
    return OrganizationType.company;
  }

  if (type === "club") {
    return OrganizationType.club;
  }

  if (type === "junior_high_school") {
    return OrganizationType.junior_high_school;
  }

  if (type === "high_school") {
    return OrganizationType.high_school;
  }

  return OrganizationType.university;
}

export async function upsertTeamCompetitionResult(prisma: PrismaClient, input: {
  batchId: string;
  sourceId: string;
  raceId: string;
  teamResult: RaceImportPayload["teamResults"][number];
}) {
  const canonicalFinalMark = normalizeMarkToCanonical(input.teamResult.finalMark);
  const canonicalCumulativeMark = normalizeMarkToCanonical(input.teamResult.snapshot.cumulativeMark);
  const canonicalGapFromLeader = normalizeMarkToCanonical(input.teamResult.snapshot.gapFromLeader);
  const race = await prisma.race.findUnique({
    where: { id: input.raceId },
    include: {
      competitionEdition: true,
    },
  });

  if (!race) {
    throw new Error(`Missing race for raceId=${input.raceId}`);
  }

  const organization = await ensureOrganization(prisma, {
    slug: input.teamResult.organizationSlug,
    nameJa: input.teamResult.organizationNameJa,
    type: mapRaceOrganizationType(input.teamResult.organizationType),
    prefecture: input.teamResult.organizationPrefecture,
    sourceId: input.sourceId,
  });

  if (!organization) {
    throw new Error(`Missing organization for team result ${input.teamResult.organizationNameJa}`);
  }

  const existingTeamResult = await prisma.teamCompetitionResult.findUnique({
    where: {
      competitionEditionId_organizationId: {
        competitionEditionId: race.competitionEditionId,
        organizationId: organization.id,
      },
    },
    select: {
      finalRank: true,
      finalMark: true,
      finalMarkMillis: true,
    },
  });

  const nextFinalRank = input.teamResult.finalRank ?? existingTeamResult?.finalRank ?? null;
  const nextFinalMark = canonicalFinalMark ?? existingTeamResult?.finalMark ?? null;
  const nextFinalMarkMillis = nextFinalMark
    ? markToMilliseconds(nextFinalMark)
    : (existingTeamResult?.finalMarkMillis ?? null);

  const teamResult = await prisma.teamCompetitionResult.upsert({
    where: {
      competitionEditionId_organizationId: {
        competitionEditionId: race.competitionEditionId,
        organizationId: organization.id,
      },
    },
    update: {
      finalRank: nextFinalRank,
      finalMark: nextFinalMark,
      finalMarkMillis: nextFinalMarkMillis,
      notes: input.teamResult.notes ?? null,
      status: DataStatus.pending,
      sourceId: input.sourceId,
    },
    create: {
      competitionEditionId: race.competitionEditionId,
      organizationId: organization.id,
      finalRank: nextFinalRank,
      finalMark: nextFinalMark,
      finalMarkMillis: nextFinalMarkMillis,
      notes: input.teamResult.notes ?? null,
      status: DataStatus.pending,
      sourceId: input.sourceId,
    },
  });

  await prisma.teamCompetitionLegSnapshot.upsert({
    where: {
      teamCompetitionResultId_leg: {
        teamCompetitionResultId: teamResult.id,
        leg: input.teamResult.snapshot.leg,
      },
    },
    update: {
      cumulativeRank: input.teamResult.snapshot.cumulativeRank ?? null,
      cumulativeMark: canonicalCumulativeMark ?? null,
      cumulativeMarkMillis: canonicalCumulativeMark ? markToMilliseconds(canonicalCumulativeMark) : null,
      gapFromLeader: canonicalGapFromLeader ?? null,
      gapFromLeaderMillis: canonicalGapFromLeader ? markToMilliseconds(canonicalGapFromLeader) : null,
      notes: input.teamResult.snapshot.notes ?? null,
      status: DataStatus.pending,
      sourceId: input.sourceId,
    },
    create: {
      teamCompetitionResultId: teamResult.id,
      leg: input.teamResult.snapshot.leg,
      cumulativeRank: input.teamResult.snapshot.cumulativeRank ?? null,
      cumulativeMark: canonicalCumulativeMark ?? null,
      cumulativeMarkMillis: canonicalCumulativeMark ? markToMilliseconds(canonicalCumulativeMark) : null,
      gapFromLeader: canonicalGapFromLeader ?? null,
      gapFromLeaderMillis: canonicalGapFromLeader ? markToMilliseconds(canonicalGapFromLeader) : null,
      notes: input.teamResult.snapshot.notes ?? null,
      status: DataStatus.pending,
      sourceId: input.sourceId,
    },
  });

  await writeAuditLog(prisma, {
    entityType: "TeamCompetitionResult",
    entityId: teamResult.id,
    fieldName: "finalMark",
    oldValue: null,
    newValue: {
      finalRank: teamResult.finalRank,
      finalMark: teamResult.finalMark,
      leg: input.teamResult.snapshot.leg,
      cumulativeRank: input.teamResult.snapshot.cumulativeRank,
    },
    sourceId: input.sourceId,
    batchId: input.batchId,
    reasonNote: `Imported team result for ${input.teamResult.organizationNameJa}`,
  });
}

export async function upsertRaceEntry(prisma: PrismaClient, input: {
  batchId: string;
  sourceId: string;
  raceId: string;
  pbNotes: string;
  protectedProfileSlugs: Set<string>;
  entry: RaceImportPayload["entries"][number];
}) {
  const canonicalMark = normalizeMarkToCanonical(input.entry.mark) ?? input.entry.mark;
  const race = await prisma.race.findUnique({
    where: { id: input.raceId },
    include: {
      competitionEdition: true,
    },
  });

  if (!race) {
    throw new Error(`Missing race for raceId=${input.raceId}`);
  }

  const raceOrganization = await ensureOrganization(prisma, {
    slug: input.entry.raceOrganizationSlug,
    nameJa: input.entry.raceOrganizationNameJa,
    type: mapRaceOrganizationType(input.entry.raceOrganizationType),
    prefecture: input.entry.raceOrganizationPrefecture,
    sourceId: input.sourceId,
  });
  const affiliationOrganization = input.entry.affiliationOrganizationNameJa && input.entry.affiliationOrganizationType
    ? await ensureOrganization(prisma, {
        slug: input.entry.affiliationOrganizationSlug,
        nameJa: input.entry.affiliationOrganizationNameJa,
        type: mapRaceOrganizationType(input.entry.affiliationOrganizationType),
        prefecture: input.entry.affiliationOrganizationPrefecture,
        sourceId: input.sourceId,
      })
    : null;
  const university = await ensureOrganization(prisma, {
    slug: input.entry.universitySlug,
    nameJa: input.entry.universityNameJa ?? (input.entry.raceOrganizationType === "university" ? input.entry.raceOrganizationNameJa : null),
    type: OrganizationType.university,
    sourceId: input.sourceId,
  });
  const highSchool = await ensureOrganization(prisma, {
    slug: input.entry.highSchoolSlug,
    nameJa: input.entry.highSchoolNameJa,
    type: OrganizationType.high_school,
    prefecture: input.entry.highSchoolPrefecture,
    sourceId: input.sourceId,
  });

  if (!raceOrganization) {
    throw new Error(`Missing organization for ${input.entry.displayNameJa}`);
  }

  const isCompetitionOnlyTeam = input.entry.raceOrganizationSlug === "kanto-student-union";
  const normalizedDisplayNameJa = normalizePersonDisplayNameJa(input.entry.displayNameJa);

  const person = await prisma.person.upsert({
    where: { slug: input.entry.slug },
    update: {
      displayNameJa: normalizedDisplayNameJa,
      displayNameJaSearch: normalizeJaName(normalizedDisplayNameJa),
      ...(input.entry.displayNameKana ? { displayNameKana: input.entry.displayNameKana } : {}),
      ...(input.entry.displayNameRoman ? { displayNameRoman: input.entry.displayNameRoman } : {}),
    },
    create: {
      slug: input.entry.slug,
      displayNameJa: normalizedDisplayNameJa,
      displayNameJaSearch: normalizeJaName(normalizedDisplayNameJa),
      displayNameKana: input.entry.displayNameKana ?? null,
      displayNameRoman: input.entry.displayNameRoman ?? null,
      type: "athlete",
      status: DataStatus.pending,
    },
  });

  const existingMemberships = !input.protectedProfileSlugs.has(input.entry.slug)
    ? await prisma.membership.findMany({
        where: { personId: person.id },
        include: {
          organization: {
            select: {
              id: true,
              type: true,
            },
          },
        },
      })
    : [];

  const referenceDate =
    race.startsAt ??
    race.competitionEdition.startsOn ??
    new Date(`${race.competitionEdition.year}-01-01T00:00:00.000Z`);
  const dates = input.entry.grade
    ? deriveAcademicDatesForEntry({
        grade: input.entry.grade,
        referenceDate,
        raceOrganizationType: input.entry.affiliationOrganizationType ?? input.entry.raceOrganizationType,
      })
    : null;

  if (
    dates &&
    !input.protectedProfileSlugs.has(input.entry.slug) &&
    !isCompetitionOnlyTeam &&
    university &&
    dates.universityStart &&
    dates.universityEnd
  ) {
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
  }

  if (
    dates &&
    !input.protectedProfileSlugs.has(input.entry.slug) &&
    !isCompetitionOnlyTeam &&
    highSchool &&
    dates.highSchoolStart &&
    dates.highSchoolEnd
  ) {
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
  } else if (dates && highSchool && dates.highSchoolStart && dates.highSchoolEnd) {
    const hasHighSchoolMembership = existingMemberships.some(
      (membership) =>
        highSchool !== null &&
        membership.organizationId === highSchool.id &&
        membership.type === MembershipType.enrolled,
    );

    // Temporary race-day teams may not reveal the athlete's home university on the source page.
    // In that case only backfill the confirmed high school membership.
    if (!hasHighSchoolMembership && highSchool) {
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

  if (dates && !input.protectedProfileSlugs.has(input.entry.slug) && affiliationOrganization) {
    if (
      affiliationOrganization.type === OrganizationType.university &&
      dates.universityStart &&
      dates.universityEnd
    ) {
      await ensureMembership(prisma, {
        personId: person.id,
        organizationId: affiliationOrganization.id,
        type: MembershipType.enrolled,
        startDate: dates.universityStart,
        endDate: dates.universityEnd,
        startYear: dates.universityStart.getFullYear(),
        endYear: dates.universityEnd.getFullYear(),
        sourceId: input.sourceId,
      });
    }

    if (
      affiliationOrganization.type === OrganizationType.high_school &&
      dates.highSchoolStart &&
      dates.highSchoolEnd
    ) {
      await ensureMembership(prisma, {
        personId: person.id,
        organizationId: affiliationOrganization.id,
        type: MembershipType.enrolled,
        startDate: dates.highSchoolStart,
        endDate: dates.highSchoolEnd,
        startYear: dates.highSchoolStart.getFullYear(),
        endYear: dates.highSchoolEnd.getFullYear(),
        sourceId: input.sourceId,
      });
    }

    if (
      affiliationOrganization.type === OrganizationType.junior_high_school &&
      dates.juniorHighSchoolStart &&
      dates.juniorHighSchoolEnd
    ) {
      await ensureMembership(prisma, {
        personId: person.id,
        organizationId: affiliationOrganization.id,
        type: MembershipType.enrolled,
        startDate: dates.juniorHighSchoolStart,
        endDate: dates.juniorHighSchoolEnd,
        startYear: dates.juniorHighSchoolStart.getFullYear(),
        endYear: dates.juniorHighSchoolEnd.getFullYear(),
        sourceId: input.sourceId,
      });
    }
  }

  if (
    !input.protectedProfileSlugs.has(input.entry.slug) &&
    (raceOrganization.type === OrganizationType.corporate_team ||
      affiliationOrganization?.type === OrganizationType.corporate_team ||
      affiliationOrganization?.type === OrganizationType.company ||
      affiliationOrganization?.type === OrganizationType.club)
  ) {
    const affiliatedOrganization = affiliationOrganization ?? raceOrganization;
    const latestUniversityMembership = existingMemberships
      .filter((membership) => membership.organization.type === OrganizationType.university)
      .sort((left, right) => {
        const leftTime =
          left.endDate?.getTime() ??
          (left.endYear ? Date.UTC(left.endYear, 2, 31) : 0);
        const rightTime =
          right.endDate?.getTime() ??
          (right.endYear ? Date.UTC(right.endYear, 2, 31) : 0);

        return rightTime - leftTime;
      })[0];

    const corporateStartDate = latestUniversityMembership?.endDate
      ? addDays(latestUniversityMembership.endDate, 1)
      : latestUniversityMembership?.endYear
        ? new Date(Date.UTC(latestUniversityMembership.endYear, 3, 1))
        : null;

    const matchingUniversityMembership = existingMemberships.find(
      (membership) => membership.organization.type === OrganizationType.university,
    );
    const matchingCorporateMembership = existingMemberships.find(
      (membership) =>
        membership.organizationId === affiliatedOrganization.id &&
        membership.organization.type === OrganizationType.corporate_team,
    );
    const knownCorporateStartDate =
      corporateStartDate ??
      (matchingCorporateMembership ? getMembershipAcademicStartDate(matchingCorporateMembership) : null);
    const inferredUniversityWindow =
      knownCorporateStartDate &&
      matchingUniversityMembership &&
      !matchingUniversityMembership.startDate &&
      !matchingUniversityMembership.endDate
        ? inferUniversityWindowFromCorporateStart(knownCorporateStartDate)
        : null;

    if (matchingUniversityMembership && inferredUniversityWindow) {
      const canApplyUniversityWindow = await canApplyInferredMembershipWindow(prisma, {
        personId: person.id,
        membershipId: matchingUniversityMembership.id,
        organizationType: OrganizationType.university,
        membershipType: MembershipType.enrolled,
        startDate: inferredUniversityWindow.universityStart,
        endDate: inferredUniversityWindow.universityEnd,
        startYear: inferredUniversityWindow.universityStart.getUTCFullYear(),
        endYear: inferredUniversityWindow.universityEnd.getUTCFullYear(),
      });

      if (canApplyUniversityWindow.allowed) {
      await ensureMembership(prisma, {
        personId: person.id,
        organizationId: matchingUniversityMembership.organizationId,
        type: MembershipType.enrolled,
        startDate: inferredUniversityWindow.universityStart,
        endDate: inferredUniversityWindow.universityEnd,
        startYear: inferredUniversityWindow.universityStart.getUTCFullYear(),
        endYear: inferredUniversityWindow.universityEnd.getUTCFullYear(),
        sourceId: input.sourceId,
      });
      }
    }

    await ensureMembership(prisma, {
      personId: person.id,
      organizationId: affiliatedOrganization.id,
      type: MembershipType.affiliated,
      startDate:
        affiliatedOrganization.type === OrganizationType.corporate_team
          ? corporateStartDate
          : null,
      endDate: null,
      startYear:
        affiliatedOrganization.type === OrganizationType.corporate_team
          ? corporateStartDate?.getUTCFullYear() ?? null
          : null,
      endYear: null,
      sourceId: input.sourceId,
    });
  }

  if (!input.protectedProfileSlugs.has(input.entry.slug)) {
    const matchingUniversityMembership = existingMemberships.find(
      (membership) => membership.organization.type === OrganizationType.university,
    );
    const matchingHighSchoolMembership = existingMemberships.find(
      (membership) => membership.organization.type === OrganizationType.high_school,
    );

    if (
      matchingUniversityMembership &&
      matchingHighSchoolMembership &&
      !matchingHighSchoolMembership.startDate &&
      !matchingHighSchoolMembership.endDate
    ) {
      const universityStartDate = getMembershipAcademicStartDate(matchingUniversityMembership);
      if (universityStartDate) {
        const inferredHighSchoolWindow = inferHighSchoolWindowFromUniversityStart(universityStartDate);

        const canApplyHighSchoolWindow = await canApplyInferredMembershipWindow(prisma, {
          personId: person.id,
          membershipId: matchingHighSchoolMembership.id,
          organizationType: OrganizationType.high_school,
          membershipType: MembershipType.enrolled,
          startDate: inferredHighSchoolWindow.highSchoolStart,
          endDate: inferredHighSchoolWindow.highSchoolEnd,
          startYear: inferredHighSchoolWindow.highSchoolStart.getUTCFullYear(),
          endYear: inferredHighSchoolWindow.highSchoolEnd.getUTCFullYear(),
        });

        if (canApplyHighSchoolWindow.allowed) {
          await ensureMembership(prisma, {
            personId: person.id,
            organizationId: matchingHighSchoolMembership.organizationId,
            type: MembershipType.enrolled,
            startDate: inferredHighSchoolWindow.highSchoolStart,
            endDate: inferredHighSchoolWindow.highSchoolEnd,
            startYear: inferredHighSchoolWindow.highSchoolStart.getUTCFullYear(),
            endYear: inferredHighSchoolWindow.highSchoolEnd.getUTCFullYear(),
            sourceId: input.sourceId,
          });
        }
      }
    }
  }

  if (!input.protectedProfileSlugs.has(input.entry.slug)) {
    for (const pb of input.entry.pbs) {
      await upsertPersonalBestSnapshot(prisma, {
        personId: person.id,
        discipline: pb.discipline,
        mark: pb.mark,
        notes: input.pbNotes,
        sourceId: pb.sourceId ?? input.sourceId,
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
      organizationId: raceOrganization.id,
      raceId: input.raceId,
      isEntry: true,
      isStarter: true,
      mark: canonicalMark,
      markMillis: markToMilliseconds(canonicalMark),
      rank: input.entry.rank,
      teamRank: input.entry.teamRank ?? null,
      gradeAtRace: input.entry.grade ?? null,
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
        displayNameKana: input.entry.displayNameKana ?? null,
        displayNameRoman: input.entry.displayNameRoman ?? null,
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
        displayNameKana: input.entry.displayNameKana ?? null,
        displayNameRoman: input.entry.displayNameRoman ?? null,
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
