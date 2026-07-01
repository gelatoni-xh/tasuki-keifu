import { AuditAction, AuditActorType, AuditReasonType, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { normalizeDisplayNameJa } from "../lib/name-normalization";

type MergePatch = {
  canonicalSlug: string;
  duplicateSlug: string;
  displayNameJa: string;
  reason: string;
};

const EDITION_RACE_SLUG_PREFIX = "all-japan-university-ekiden-57-leg-";
const KNOWN_DIFFERENT_PERSON_KEYS = new Set([
  `${normalizeDisplayNameJa("佐藤 匠")}::person-e4bd90e897a420e58ca0::sato-takumi-sapporo-gakuin`,
]);

function compactName(value: string) {
  return normalizeDisplayNameJa(value).replace(/ /g, "");
}

function pairKey(name: string, leftSlug: string, rightSlug: string) {
  return `${normalizeDisplayNameJa(name)}::${leftSlug}::${rightSlug}`;
}

function isKnownDifferentPerson(name: string, leftSlug: string, rightSlug: string) {
  return KNOWN_DIFFERENT_PERSON_KEYS.has(pairKey(name, leftSlug, rightSlug))
    || KNOWN_DIFFERENT_PERSON_KEYS.has(pairKey(name, rightSlug, leftSlug));
}

async function buildMergePatches(prismaClient: PrismaClient) {
  const editionPeople = await prismaClient.person.findMany({
    where: {
      raceResults: {
        some: {
          race: {
            slug: {
              startsWith: EDITION_RACE_SLUG_PREFIX,
            },
          },
        },
      },
    },
    select: {
      id: true,
      slug: true,
      displayNameJa: true,
    },
    orderBy: {
      displayNameJa: "asc",
    },
  });

  const patches = new Map<string, MergePatch>();

  for (const editionPerson of editionPeople) {
    const sameNamePeople = await prismaClient.person.findMany({
      where: {
        id: {
          not: editionPerson.id,
        },
      },
      select: {
        slug: true,
        displayNameJa: true,
      },
    });

    const candidates = sameNamePeople.filter(
      (person) => compactName(person.displayNameJa) === compactName(editionPerson.displayNameJa),
    );

    if (candidates.length !== 1) {
      continue;
    }

    const candidate = candidates[0]!;
    if (isKnownDifferentPerson(editionPerson.displayNameJa, editionPerson.slug, candidate.slug)) {
      continue;
    }

    const editionPersonIsTemporary = editionPerson.slug.startsWith("person-");
    const candidateIsTemporary = candidate.slug.startsWith("person-");
    const canonicalSlug = editionPersonIsTemporary && !candidateIsTemporary
      ? candidate.slug
      : !editionPersonIsTemporary && candidateIsTemporary
        ? editionPerson.slug
        : editionPerson.slug;
    const duplicateSlug = canonicalSlug === editionPerson.slug ? candidate.slug : editionPerson.slug;

    patches.set(`${canonicalSlug}<-${duplicateSlug}`, {
      canonicalSlug,
      duplicateSlug,
      displayNameJa: normalizeDisplayNameJa(editionPerson.displayNameJa),
      reason: "all-japan-university-ekiden-57 exact same Japanese name",
    });
  }

  return [...patches.values()].sort((left, right) =>
    left.displayNameJa.localeCompare(right.displayNameJa, "ja")
    || left.canonicalSlug.localeCompare(right.canonicalSlug),
  );
}

async function mergePeople(prismaClient: PrismaClient, patch: MergePatch) {
  const [canonical, duplicate] = await Promise.all([
    prismaClient.person.findUnique({
      where: { slug: patch.canonicalSlug },
      include: {
        nameVariants: true,
      },
    }),
    prismaClient.person.findUnique({
      where: { slug: patch.duplicateSlug },
      include: {
        nameVariants: true,
      },
    }),
  ]);

  if (!canonical || !duplicate) {
    return {
      ...patch,
      skipped: true,
      reason: "missing_person",
    };
  }

  if (compactName(canonical.displayNameJa) !== compactName(duplicate.displayNameJa)) {
    throw new Error(`Display name mismatch for ${patch.canonicalSlug} <- ${patch.duplicateSlug}`);
  }

  await prismaClient.$transaction(async (tx) => {
    await tx.membership.updateMany({
      where: { personId: duplicate.id },
      data: { personId: canonical.id },
    });

    await tx.personalBest.updateMany({
      where: { personId: duplicate.id },
      data: { personId: canonical.id },
    });

    await tx.raceResult.updateMany({
      where: { personId: duplicate.id },
      data: { personId: canonical.id },
    });

    await tx.sourceReference.updateMany({
      where: { personId: duplicate.id },
      data: { personId: canonical.id },
    });

    await tx.playerRelationCache.deleteMany({
      where: {
        personId: {
          in: [canonical.id, duplicate.id],
        },
      },
    });

    for (const variant of duplicate.nameVariants) {
      const exists = await tx.nameVariant.findFirst({
        where: {
          personId: canonical.id,
          value: variant.value,
        },
      });

      if (!exists) {
        await tx.nameVariant.create({
          data: {
            personId: canonical.id,
            value: variant.value,
            type: variant.type,
            sourceId: variant.sourceId,
            isPrimary: false,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        entityType: "Person",
        entityId: canonical.id,
        action: AuditAction.merge,
        oldValue: {
          mergedPersonId: duplicate.id,
          mergedPersonSlug: duplicate.slug,
          mergedPersonNameJa: duplicate.displayNameJa,
        } as never,
        newValue: {
          canonicalPersonId: canonical.id,
          canonicalPersonSlug: canonical.slug,
          canonicalPersonNameJa: canonical.displayNameJa,
        } as never,
        reasonType: AuditReasonType.entity_merge,
        reasonNote: patch.reason,
        actorType: AuditActorType.system,
      },
    });

    await tx.nameVariant.deleteMany({
      where: { personId: duplicate.id },
    });

    await tx.person.delete({
      where: { id: duplicate.id },
    });
  });

  return {
    ...patch,
    skipped: false,
  };
}

async function main() {
  const shouldApply = process.argv.includes("--apply");
  const patches = await buildMergePatches(prisma);

  if (!shouldApply) {
    console.log(JSON.stringify({ dryRun: true, count: patches.length, patches }, null, 2));
    return;
  }

  const merged = [];
  for (const patch of patches) {
    merged.push(await mergePeople(prisma, patch));
  }

  console.log(JSON.stringify({ dryRun: false, count: merged.length, merged }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
