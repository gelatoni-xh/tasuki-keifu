import { AuditAction, AuditActorType, AuditReasonType, OrganizationType, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  buildOrganizationCanonicalKey,
  getOrganizationCanonicalScore,
  normalizeOrganizationLabel,
} from "../lib/organization-normalization";

type OrganizationCandidate = {
  id: string;
  slug: string;
  nameJa: string;
  type: OrganizationType;
  shortName: string | null;
  sourceReferences: Array<{
    id: string;
    sourceId: string;
    sourceEntityType: string;
    sourceEntityKey: string;
  }>;
  nameVariants: Array<{
    id: string;
    value: string;
    type: string;
    sourceId: string | null;
  }>;
  _count: {
    memberships: number;
    raceResults: number;
    teamCompetitionResults: number;
    sourceReferences: number;
  };
};

function chooseCanonicalOrganization(organizations: OrganizationCandidate[]) {
  return [...organizations].sort((left, right) => {
    const scoreDelta =
      getOrganizationCanonicalScore(right.nameJa, right.type) -
      getOrganizationCanonicalScore(left.nameJa, left.type);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const dependencyDelta =
      (right._count.memberships +
        right._count.raceResults +
        right._count.teamCompetitionResults +
        right._count.sourceReferences) -
      (left._count.memberships +
        left._count.raceResults +
        left._count.teamCompetitionResults +
        left._count.sourceReferences);
    if (dependencyDelta !== 0) {
      return dependencyDelta;
    }

    return left.nameJa.localeCompare(right.nameJa, "ja");
  })[0];
}

type ScriptPrismaClientLike = PrismaClient | Prisma.TransactionClient;

async function ensureOrganizationAlias(prismaClient: ScriptPrismaClientLike, input: {
  organizationId: string;
  value: string;
  sourceId?: string | null;
  type?: "official" | "former" | "media" | "short";
  isPrimary?: boolean;
}) {
  const normalizedValue = normalizeOrganizationLabel(input.value);
  if (!normalizedValue) {
    return;
  }

  const existingVariants = await prismaClient.nameVariant.findMany({
    where: {
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      value: true,
    },
  });

  const exists = existingVariants.some(
    (variant) => normalizeOrganizationLabel(variant.value) === normalizedValue,
  );

  if (exists) {
    return;
  }

  await prismaClient.nameVariant.create({
    data: {
      organizationId: input.organizationId,
      value: input.value,
      type: input.type ?? "former",
      sourceId: input.sourceId ?? undefined,
      isPrimary: input.isPrimary ?? false,
    },
  });
}

async function mergeOrganizationGroup(prismaClient: PrismaClient, group: OrganizationCandidate[]) {
  const canonical = chooseCanonicalOrganization(group);
  const duplicates = group.filter((organization) => organization.id !== canonical.id);

  if (duplicates.length === 0) {
    return null;
  }

  await prismaClient.$transaction(async (transaction) => {
    await ensureOrganizationAlias(transaction, {
      organizationId: canonical.id,
      value: canonical.nameJa,
      type: "official",
      isPrimary: true,
    });

    for (const duplicate of duplicates) {
      await ensureOrganizationAlias(transaction, {
        organizationId: canonical.id,
        value: duplicate.nameJa,
        sourceId: duplicate.sourceReferences[0]?.sourceId ?? null,
        type: "former",
      });

      if (duplicate.shortName) {
        await ensureOrganizationAlias(transaction, {
          organizationId: canonical.id,
          value: duplicate.shortName,
          sourceId: duplicate.sourceReferences[0]?.sourceId ?? null,
          type: "short",
        });
      }

      for (const variant of duplicate.nameVariants) {
        await ensureOrganizationAlias(transaction, {
          organizationId: canonical.id,
          value: variant.value,
          sourceId: variant.sourceId,
          type: variant.type as "official" | "former" | "media" | "short",
        });
      }

      await transaction.membership.updateMany({
        where: { organizationId: duplicate.id },
        data: { organizationId: canonical.id },
      });

      await transaction.raceResult.updateMany({
        where: { organizationId: duplicate.id },
        data: { organizationId: canonical.id },
      });

      const duplicateTeamResults = await transaction.teamCompetitionResult.findMany({
        where: { organizationId: duplicate.id },
        select: {
          id: true,
          competitionEditionId: true,
        },
      });

      for (const teamResult of duplicateTeamResults) {
        const existing = await transaction.teamCompetitionResult.findUnique({
          where: {
            competitionEditionId_organizationId: {
              competitionEditionId: teamResult.competitionEditionId,
              organizationId: canonical.id,
            },
          },
          select: { id: true },
        });

        if (existing) {
          await transaction.teamCompetitionLegSnapshot.deleteMany({
            where: { teamCompetitionResultId: teamResult.id },
          });
          await transaction.teamCompetitionResult.delete({
            where: { id: teamResult.id },
          });
          continue;
        }

        await transaction.teamCompetitionResult.update({
          where: { id: teamResult.id },
          data: { organizationId: canonical.id },
        });
      }

      await transaction.sourceReference.updateMany({
        where: { organizationId: duplicate.id },
        data: { organizationId: canonical.id },
      });

      await transaction.auditLog.create({
        data: {
          entityType: "Organization",
          entityId: canonical.id,
          action: AuditAction.merge,
          oldValue: {
            mergedOrganizationId: duplicate.id,
            mergedOrganizationSlug: duplicate.slug,
            mergedOrganizationNameJa: duplicate.nameJa,
          } as never,
          newValue: {
            canonicalOrganizationId: canonical.id,
            canonicalOrganizationSlug: canonical.slug,
            canonicalOrganizationNameJa: canonical.nameJa,
          } as never,
          reasonType: AuditReasonType.entity_merge,
          reasonNote: `Merged duplicate organization ${duplicate.nameJa} into ${canonical.nameJa}`,
          actorType: AuditActorType.system,
        },
      });

      await transaction.nameVariant.deleteMany({
        where: { organizationId: duplicate.id },
      });

      await transaction.organization.delete({
        where: { id: duplicate.id },
      });
    }
  });

  return {
    canonical: {
      id: canonical.id,
      slug: canonical.slug,
      nameJa: canonical.nameJa,
    },
    mergedOrganizations: duplicates.map((organization) => ({
      id: organization.id,
      slug: organization.slug,
      nameJa: organization.nameJa,
    })),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const organizations = await prisma.organization.findMany({
    where: {
      type: OrganizationType.high_school,
    },
    include: {
      sourceReferences: {
        select: {
          id: true,
          sourceId: true,
          sourceEntityType: true,
          sourceEntityKey: true,
        },
      },
      nameVariants: {
        select: {
          id: true,
          value: true,
          type: true,
          sourceId: true,
        },
      },
      _count: {
        select: {
          memberships: true,
          raceResults: true,
          teamCompetitionResults: true,
          sourceReferences: true,
        },
      },
    },
    orderBy: [{ nameJa: "asc" }],
  });

  const groups = new Map<string, OrganizationCandidate[]>();
  for (const organization of organizations) {
    const key = buildOrganizationCanonicalKey(organization.nameJa, organization.type);
    const existing = groups.get(key) ?? [];
    existing.push(organization);
    groups.set(key, existing);
  }

  const duplicateGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => right.length - left.length);

  const summary = [];

  for (const group of duplicateGroups) {
    if (dryRun) {
      const canonical = chooseCanonicalOrganization(group);
      summary.push({
        canonical: {
          id: canonical.id,
          slug: canonical.slug,
          nameJa: canonical.nameJa,
        },
        mergedOrganizations: group
          .filter((organization) => organization.id !== canonical.id)
          .map((organization) => ({
            id: organization.id,
            slug: organization.slug,
            nameJa: organization.nameJa,
          })),
      });
      continue;
    }

    const merged = await mergeOrganizationGroup(prisma, group);
    if (merged) {
      summary.push(merged);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        mergedGroupCount: summary.length,
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
