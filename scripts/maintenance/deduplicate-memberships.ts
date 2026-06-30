import { AuditAction, AuditActorType, AuditReasonType, type Membership, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

type MembershipRow = Membership & {
  person: {
    slug: string;
    displayNameJa: string;
  };
  organization: {
    slug: string;
    nameJa: string;
    type: string;
  };
};

function membershipKey(membership: MembershipRow) {
  return [
    membership.personId,
    membership.organizationId,
    membership.type,
    membership.role,
    membership.startDate?.toISOString().slice(0, 10) ?? "",
    membership.endDate?.toISOString().slice(0, 10) ?? "",
    membership.startYear ?? "",
    membership.endYear ?? "",
  ].join("::");
}

function choosePrimaryMembership(memberships: MembershipRow[]) {
  return [...memberships].sort((left, right) => {
    const completenessDelta =
      Number(Boolean(right.faculty)) +
      Number(Boolean(right.department)) +
      Number(Boolean(right.cohort)) +
      Number(Boolean(right.notes)) +
      Number(Boolean(right.sourceId)) -
      (Number(Boolean(left.faculty)) +
        Number(Boolean(left.department)) +
        Number(Boolean(left.cohort)) +
        Number(Boolean(left.notes)) +
        Number(Boolean(left.sourceId)));

    if (completenessDelta !== 0) {
      return completenessDelta;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  })[0];
}

function mergeText(...values: Array<string | null | undefined>) {
  const unique = [...new Set(values.map((value) => value?.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(" | ") : null;
}

async function mergeMembershipGroup(prismaClient: PrismaClient, group: MembershipRow[]) {
  const primary = choosePrimaryMembership(group);
  const duplicates = group.filter((membership) => membership.id !== primary.id);

  if (duplicates.length === 0) {
    return null;
  }

  const mergedNotes = mergeText(primary.notes, ...duplicates.map((membership) => membership.notes));
  const mergedFaculty = primary.faculty ?? duplicates.find((membership) => membership.faculty)?.faculty ?? null;
  const mergedDepartment = primary.department ?? duplicates.find((membership) => membership.department)?.department ?? null;
  const mergedCohort = primary.cohort ?? duplicates.find((membership) => membership.cohort)?.cohort ?? null;
  const mergedSourceId = primary.sourceId ?? duplicates.find((membership) => membership.sourceId)?.sourceId ?? null;

  await prismaClient.$transaction(async (transaction) => {
    await transaction.membership.update({
      where: { id: primary.id },
      data: {
        faculty: mergedFaculty,
        department: mergedDepartment,
        cohort: mergedCohort,
        notes: mergedNotes,
        sourceId: mergedSourceId,
      },
    });

    for (const duplicate of duplicates) {
      await transaction.auditLog.create({
        data: {
          entityType: "Membership",
          entityId: primary.id,
          action: AuditAction.merge,
          oldValue: {
            mergedMembershipId: duplicate.id,
            mergedOrganizationSlug: duplicate.organization.slug,
            mergedOrganizationNameJa: duplicate.organization.nameJa,
          } as never,
          newValue: {
            canonicalMembershipId: primary.id,
            personSlug: primary.person.slug,
            organizationSlug: primary.organization.slug,
            organizationNameJa: primary.organization.nameJa,
          } as never,
          reasonType: AuditReasonType.entity_merge,
          reasonNote: `Deduplicated identical membership for ${primary.person.displayNameJa} at ${primary.organization.nameJa}`,
          actorType: AuditActorType.system,
        },
      });

      await transaction.membership.delete({
        where: { id: duplicate.id },
      });
    }
  });

  return {
    personSlug: primary.person.slug,
    displayNameJa: primary.person.displayNameJa,
    organizationSlug: primary.organization.slug,
    organizationNameJa: primary.organization.nameJa,
    keptMembershipId: primary.id,
    removedMembershipIds: duplicates.map((membership) => membership.id),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const memberships = await prisma.membership.findMany({
    include: {
      person: {
        select: {
          slug: true,
          displayNameJa: true,
        },
      },
      organization: {
        select: {
          slug: true,
          nameJa: true,
          type: true,
        },
      },
    },
    orderBy: [{ personId: "asc" }, { organizationId: "asc" }, { createdAt: "asc" }],
  });

  const grouped = new Map<string, MembershipRow[]>();
  for (const membership of memberships) {
    const key = membershipKey(membership);
    const existing = grouped.get(key) ?? [];
    existing.push(membership);
    grouped.set(key, existing);
  }

  const duplicateGroups = [...grouped.values()].filter((group) => group.length > 1);
  const summary = [];

  for (const group of duplicateGroups) {
    if (dryRun) {
      const primary = choosePrimaryMembership(group);
      summary.push({
        personSlug: primary.person.slug,
        displayNameJa: primary.person.displayNameJa,
        organizationSlug: primary.organization.slug,
        organizationNameJa: primary.organization.nameJa,
        membershipIds: group.map((membership) => membership.id),
      });
      continue;
    }

    const merged = await mergeMembershipGroup(prisma, group);
    if (merged) {
      summary.push(merged);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        duplicateGroupCount: duplicateGroups.length,
        resolvedGroupCount: summary.length,
        summary,
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
