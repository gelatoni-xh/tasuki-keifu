import { AuditAction, AuditActorType, AuditReasonType, OrganizationType, type Membership } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { runScript } from "../lib/script-runtime";
import { bumpCacheInvalidationScope } from "../lib/cache-invalidation";

type MembershipRow = Membership & {
  person: {
    id: string;
    slug: string;
    displayNameJa: string;
  };
  organization: {
    id: string;
    slug: string;
    nameJa: string;
    type: OrganizationType;
  };
};

type TimelinePatch = {
  membershipId: string;
  personId: string;
  personSlug: string;
  displayNameJa: string;
  organizationSlug: string;
  organizationNameJa: string;
  patch: {
    startDate?: Date;
    endDate?: Date;
    startYear?: number;
    endYear?: number;
  };
  oldValue: {
    startDate: string | null;
    endDate: string | null;
    startYear: number | null;
    endYear: number | null;
  };
  newValue: {
    startDate: string | null;
    endDate: string | null;
    startYear: number | null;
    endYear: number | null;
  };
  reasonNote: string;
  rule: "corp_after_university" | "high_school_before_university" | "university_before_corporate";
};

function toIsoDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function makeUtcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getAcademicStartYear(date: Date) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  return month >= 4 ? year : year - 1;
}

function getAcademicStartDateFromMembership(membership: Pick<Membership, "startDate" | "startYear">) {
  if (membership.startDate) {
    return membership.startDate;
  }

  if (membership.startYear) {
    return makeUtcDate(membership.startYear, 3, 1);
  }

  return null;
}

function getAcademicEndDateFromMembership(membership: Pick<Membership, "endDate" | "endYear">) {
  if (membership.endDate) {
    return membership.endDate;
  }

  if (membership.endYear) {
    return makeUtcDate(membership.endYear, 2, 31);
  }

  return null;
}

function deriveHighSchoolWindowFromUniversityStart(universityStart: Date) {
  const universityStartYear = getAcademicStartYear(universityStart);

  return {
    startDate: makeUtcDate(universityStartYear - 3, 3, 1),
    endDate: makeUtcDate(universityStartYear, 2, 31),
    startYear: universityStartYear - 3,
    endYear: universityStartYear,
  };
}

function deriveUniversityWindowFromCorporateStart(corporateStart: Date) {
  const corporateAcademicStartYear = getAcademicStartYear(corporateStart);

  return {
    startDate: makeUtcDate(corporateAcademicStartYear - 4, 3, 1),
    endDate: makeUtcDate(corporateAcademicStartYear, 2, 31),
    startYear: corporateAcademicStartYear - 4,
    endYear: corporateAcademicStartYear,
  };
}

function deriveCorporateStartFromUniversityEnd(universityEnd: Date) {
  const startDate = addDays(universityEnd, 1);

  return {
    startDate,
    startYear: getAcademicStartYear(startDate),
  };
}

function buildPatchIfCompatible(input: {
  membership: MembershipRow;
  inferred: {
    startDate?: Date;
    endDate?: Date;
    startYear?: number;
    endYear?: number;
  };
  reasonNote: string;
  rule: TimelinePatch["rule"];
}) {
  const { membership, inferred } = input;
  const patch: TimelinePatch["patch"] = {};

  if (inferred.startDate) {
    const existingStartDate = toIsoDate(membership.startDate);
    const inferredStartDate = toIsoDate(inferred.startDate);

    if (existingStartDate && existingStartDate !== inferredStartDate) {
      return null;
    }

    if (!existingStartDate) {
      patch.startDate = inferred.startDate;
    }
  }

  if (inferred.endDate) {
    const existingEndDate = toIsoDate(membership.endDate);
    const inferredEndDate = toIsoDate(inferred.endDate);

    if (existingEndDate && existingEndDate !== inferredEndDate) {
      return null;
    }

    if (!existingEndDate) {
      patch.endDate = inferred.endDate;
    }
  }

  if (typeof inferred.startYear === "number") {
    if (membership.startYear && membership.startYear !== inferred.startYear) {
      return null;
    }

    if (!membership.startYear) {
      patch.startYear = inferred.startYear;
    }
  }

  if (typeof inferred.endYear === "number") {
    if (membership.endYear && membership.endYear !== inferred.endYear) {
      return null;
    }

    if (!membership.endYear) {
      patch.endYear = inferred.endYear;
    }
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  return {
    membershipId: membership.id,
    personId: membership.person.id,
    personSlug: membership.person.slug,
    displayNameJa: membership.person.displayNameJa,
    organizationSlug: membership.organization.slug,
    organizationNameJa: membership.organization.nameJa,
    patch,
    oldValue: {
      startDate: toIsoDate(membership.startDate),
      endDate: toIsoDate(membership.endDate),
      startYear: membership.startYear,
      endYear: membership.endYear,
    },
    newValue: {
      startDate: toIsoDate(patch.startDate ?? membership.startDate),
      endDate: toIsoDate(patch.endDate ?? membership.endDate),
      startYear: patch.startYear ?? membership.startYear,
      endYear: patch.endYear ?? membership.endYear,
    },
    reasonNote: input.reasonNote,
    rule: input.rule,
  } satisfies TimelinePatch;
}

async function recomputePlayerRelationCache(personId: string) {
  const { buildPlayerRelations } = await import("../../src/lib/player-relations/build-player-relations");
  const payload = await buildPlayerRelations(personId);

  await prisma.playerRelationCache.upsert({
    where: { personId },
    update: {
      payload,
      generatedAt: new Date(payload.generatedAt),
    },
    create: {
      personId,
      payload,
      generatedAt: new Date(payload.generatedAt),
    },
  });
}

async function loadAthleteMemberships() {
  return prisma.membership.findMany({
    where: {
      role: "athlete",
      organization: {
        type: {
          in: [OrganizationType.high_school, OrganizationType.university, OrganizationType.corporate_team],
        },
      },
    },
    include: {
      person: {
        select: {
          id: true,
          slug: true,
          displayNameJa: true,
        },
      },
      organization: {
        select: {
          id: true,
          slug: true,
          nameJa: true,
          type: true,
        },
      },
    },
    orderBy: [
      { personId: "asc" },
      { startDate: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
}

function buildTimelinePatches(rows: MembershipRow[]) {
  const people = new Map<string, MembershipRow[]>();

  for (const row of rows) {
    const group = people.get(row.personId) ?? [];
    group.push(row);
    people.set(row.personId, group);
  }

  const patches: TimelinePatch[] = [];

  for (const memberships of people.values()) {
    const highSchools = memberships.filter((row) => row.organization.type === OrganizationType.high_school);
    const universities = memberships.filter((row) => row.organization.type === OrganizationType.university);
    const corporateTeams = memberships.filter((row) => row.organization.type === OrganizationType.corporate_team);

    for (const university of universities) {
      const universityStart = getAcademicStartDateFromMembership(university);
      const universityEnd = getAcademicEndDateFromMembership(university);

      if (universityStart) {
        const inferredHighSchool = deriveHighSchoolWindowFromUniversityStart(universityStart);

        for (const highSchool of highSchools) {
          const patch = buildPatchIfCompatible({
            membership: highSchool,
            inferred: inferredHighSchool,
            reasonNote: `Inferred high school membership window from known university start for ${highSchool.person.displayNameJa}`,
            rule: "high_school_before_university",
          });

          if (patch) {
            patches.push(patch);
          }
        }
      }

      if (universityEnd) {
        const inferredCorporateStart = deriveCorporateStartFromUniversityEnd(universityEnd);

        for (const corporateTeam of corporateTeams) {
          const patch = buildPatchIfCompatible({
            membership: corporateTeam,
            inferred: inferredCorporateStart,
            reasonNote: `Inferred corporate team start from known university end for ${corporateTeam.person.displayNameJa}`,
            rule: "corp_after_university",
          });

          if (patch) {
            patches.push(patch);
          }
        }
      }
    }

    for (const corporateTeam of corporateTeams) {
      const corporateStart = getAcademicStartDateFromMembership(corporateTeam);
      if (!corporateStart) {
        continue;
      }

      const inferredUniversity = deriveUniversityWindowFromCorporateStart(corporateStart);

      for (const university of universities) {
        const patch = buildPatchIfCompatible({
          membership: university,
          inferred: inferredUniversity,
          reasonNote: `Inferred university membership window from known corporate team start for ${university.person.displayNameJa}`,
          rule: "university_before_corporate",
        });

        if (patch) {
          patches.push(patch);
        }
      }
    }
  }

  const uniquePatches = new Map<string, TimelinePatch>();
  for (const patch of patches) {
    uniquePatches.set(`${patch.membershipId}:${patch.rule}`, patch);
  }

  return [...uniquePatches.values()];
}

async function main() {
  await runScript(
    {
      script: "maintenance/repair-membership-transition-timelines",
      disconnect: () => prisma.$disconnect(),
    },
    async ({ logger }) => {
      const apply = process.argv.includes("--apply");
      const memberships = await loadAthleteMemberships();
      const patches = buildTimelinePatches(memberships);

      logger.info("membership_transition_timeline_scan_completed", {
        checked_memberships: memberships.length,
        patch_count: patches.length,
        apply,
        rule_counts: patches.reduce<Record<string, number>>((counts, patch) => {
          counts[patch.rule] = (counts[patch.rule] ?? 0) + 1;
          return counts;
        }, {}),
      });

      for (const patch of patches) {
        logger.info("membership_transition_timeline_candidate", {
          person_slug: patch.personSlug,
          display_name_ja: patch.displayNameJa,
          organization_slug: patch.organizationSlug,
          organization_name_ja: patch.organizationNameJa,
          membership_id: patch.membershipId,
          rule: patch.rule,
          old_value: patch.oldValue,
          new_value: patch.newValue,
        });
      }

      if (!apply || patches.length === 0) {
        return;
      }

      const affectedPersonIds = new Set<string>();

      for (const patch of patches) {
        await prisma.$transaction(async (tx) => {
          await tx.membership.update({
            where: { id: patch.membershipId },
            data: patch.patch,
          });

          await tx.auditLog.create({
            data: {
              entityType: "Membership",
              entityId: patch.membershipId,
              action: AuditAction.update,
              fieldName: "timeline",
              oldValue: patch.oldValue as never,
              newValue: patch.newValue as never,
              reasonType: AuditReasonType.source_correction,
              reasonNote: patch.reasonNote,
              actorType: AuditActorType.system,
            },
          });
        });

        affectedPersonIds.add(patch.personId);
      }

      for (const personId of affectedPersonIds) {
        await recomputePlayerRelationCache(personId);
      }

      await bumpCacheInvalidationScope(prisma, "player-detail");

      logger.info("membership_transition_timeline_repair_completed", {
        patched_memberships: patches.length,
        affected_people: affectedPersonIds.size,
      });
    },
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
