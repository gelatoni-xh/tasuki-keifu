import { AuditAction, AuditActorType, AuditReasonType, type MembershipType, type NameVariantType } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { normalizeOrganizationLabel } from "../lib/organization-normalization";

type MergeRule = {
  canonicalSlug: string;
  duplicateSlugs: string[];
  note: string;
  canonicalSeed?: {
    nameJa: string;
    type: "high_school" | "university" | "club" | "corporate_team";
    officialAliases?: string[];
  };
};

const MERGE_RULES: MergeRule[] = [
  {
    canonicalSlug: "gmo-internet-group",
    duplicateSlugs: [
      "org-nittaidai326-8fe71597e8c9ca2f622c",
      "org-hachioji2022-8f804cc8e8d495793f4f",
    ],
    note: "Normalize truncated GMO INTERNET GROUP variants from recent imports.",
  },
  {
    canonicalSlug: "org-hachioji2025-nttexc",
    duplicateSlugs: ["org-kanaguri2026-ntt-exc-partner-group"],
    note: "Normalize abbreviated NTT ExC partner group label from recent imports.",
  },
  {
    canonicalSlug: "tokyo-rikujokyogi-kyokai",
    duplicateSlugs: ["org-nittaidai330-52a8c225277af01389ef"],
    note: "Normalize Tokyo athletics association shorthand from recent imports.",
  },
  {
    canonicalSlug: "kokusai-budo-university",
    duplicateSlugs: ["org-nittaidai330-6b585dabebfcdbd291d0"],
    note: "Normalize source-local university sub-team label to canonical university.",
  },
  {
    canonicalSlug: "org-nittaidai331-aa27484f28ba94d0ea2c",
    duplicateSlugs: ["org-nittaidai326-7ec06d32dfbc05025fd3"],
    note: "Normalize truncated high-school label to canonical school.",
  },
  {
    canonicalSlug: "bunsei-university-of-art-high-school",
    duplicateSlugs: [
      "org-nittaidai330-e666e36075e0c6fa0a2a",
      "org-nittaidai331-44b2db79f8863c71b7bb",
      "hs-文星芸大附高",
    ],
    note: "Normalize Bunsei University of Art high-school naming variants from recent imports.",
    canonicalSeed: {
      nameJa: "文星芸術大学附属高校",
      type: "high_school",
      officialAliases: ["文星芸術大学附属高等学校"],
    },
  },
  {
    canonicalSlug: "shohei-high-school",
    duplicateSlugs: ["org-nittaidai326-c86dcac2c9148a252948"],
    note: "Normalize shorthand Shohei high-school label from recent imports.",
    canonicalSeed: {
      nameJa: "昌平高校",
      type: "high_school",
      officialAliases: ["昌平高等学校"],
    },
  },
];

function membershipSignature(input: {
  personId: string;
  type: MembershipType;
  startDate: Date | null;
  endDate: Date | null;
  startYear: number | null;
  endYear: number | null;
}) {
  return [
    input.personId,
    input.type,
    input.startDate?.toISOString().slice(0, 10) ?? "",
    input.endDate?.toISOString().slice(0, 10) ?? "",
    input.startYear ?? "",
    input.endYear ?? "",
  ].join("::");
}

type PrismaLike = Parameters<typeof prisma.$transaction>[0] extends (tx: infer T) => Promise<unknown> ? T : never;

async function ensureOrganizationAlias(tx: PrismaLike, input: {
  organizationId: string;
  value: string;
  type: NameVariantType;
  sourceId?: string | null;
  isPrimary?: boolean;
}) {
  const normalizedValue = normalizeOrganizationLabel(input.value);
  if (!normalizedValue) return;

  const existing = await tx.nameVariant.findMany({
    where: { organizationId: input.organizationId },
    select: { id: true, value: true },
  });

  if (existing.some((variant) => normalizeOrganizationLabel(variant.value) === normalizedValue)) {
    return;
  }

  await tx.nameVariant.create({
    data: {
      organizationId: input.organizationId,
      value: input.value,
      type: input.type,
      sourceId: input.sourceId ?? undefined,
      isPrimary: input.isPrimary ?? false,
    },
  });
}

async function mergeIntoCanonical(rule: MergeRule) {
  let canonical = await prisma.organization.findUnique({
    where: { slug: rule.canonicalSlug },
    include: {
      nameVariants: true,
    },
  });

  if (!canonical && rule.canonicalSeed) {
    canonical = await prisma.organization.create({
      data: {
        slug: rule.canonicalSlug,
        nameJa: rule.canonicalSeed.nameJa,
        type: rule.canonicalSeed.type,
      },
      include: {
        nameVariants: true,
      },
    });
  }

  if (!canonical) {
    throw new Error(`Missing canonical organization: ${rule.canonicalSlug}`);
  }

  for (const duplicateSlug of rule.duplicateSlugs) {
    const duplicate = await prisma.organization.findUnique({
      where: { slug: duplicateSlug },
      include: {
        nameVariants: true,
        sourceReferences: true,
        memberships: true,
      },
    });

    if (!duplicate) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await ensureOrganizationAlias(tx, {
        organizationId: canonical.id,
        value: canonical.nameJa,
        type: "official",
        isPrimary: true,
      });

      for (const officialAlias of rule.canonicalSeed?.officialAliases ?? []) {
        await ensureOrganizationAlias(tx, {
          organizationId: canonical.id,
          value: officialAlias,
          type: "official",
        });
      }

      await ensureOrganizationAlias(tx, {
        organizationId: canonical.id,
        value: duplicate.nameJa,
        type: "former",
        sourceId: duplicate.sourceReferences[0]?.sourceId ?? null,
      });

      if (duplicate.shortName) {
        await ensureOrganizationAlias(tx, {
          organizationId: canonical.id,
          value: duplicate.shortName,
          type: "short",
          sourceId: duplicate.sourceReferences[0]?.sourceId ?? null,
        });
      }

      for (const variant of duplicate.nameVariants) {
        await ensureOrganizationAlias(tx, {
          organizationId: canonical.id,
          value: variant.value,
          type: variant.type,
          sourceId: variant.sourceId,
          isPrimary: variant.isPrimary,
        });
      }

      const canonicalMemberships = await tx.membership.findMany({
        where: { organizationId: canonical.id },
        select: {
          id: true,
          personId: true,
          type: true,
          startDate: true,
          endDate: true,
          startYear: true,
          endYear: true,
        },
      });

      const canonicalMembershipKeys = new Map(
        canonicalMemberships.map((membership) => [membershipSignature(membership), membership.id]),
      );

      for (const membership of duplicate.memberships) {
        const key = membershipSignature(membership);
        if (canonicalMembershipKeys.has(key)) {
          await tx.membership.delete({ where: { id: membership.id } });
          continue;
        }

        await tx.membership.update({
          where: { id: membership.id },
          data: { organizationId: canonical.id },
        });
      }

      await tx.raceResult.updateMany({
        where: { organizationId: duplicate.id },
        data: { organizationId: canonical.id },
      });

      await tx.sourceReference.updateMany({
        where: { organizationId: duplicate.id },
        data: { organizationId: canonical.id },
      });

      await tx.auditLog.create({
        data: {
          entityType: "Organization",
          entityId: canonical.id,
          action: AuditAction.merge,
          oldValue: {
            mergedOrganizationId: duplicate.id,
            mergedOrganizationSlug: duplicate.slug,
            mergedOrganizationNameJa: duplicate.nameJa,
            mergedOrganizationType: duplicate.type,
          } as never,
          newValue: {
            canonicalOrganizationId: canonical.id,
            canonicalOrganizationSlug: canonical.slug,
            canonicalOrganizationNameJa: canonical.nameJa,
            canonicalOrganizationType: canonical.type,
          } as never,
          reasonType: AuditReasonType.format_normalization,
          reasonNote: rule.note,
          actorType: AuditActorType.system,
        },
      });

      await tx.nameVariant.deleteMany({
        where: { organizationId: duplicate.id },
      });

      await tx.organization.delete({
        where: { id: duplicate.id },
      });
    });

    console.log(`merged ${duplicate.slug} -> ${canonical.slug}`);
  }
}

async function main() {
  for (const rule of MERGE_RULES) {
    await mergeIntoCanonical(rule);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
