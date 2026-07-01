import { readFile } from "node:fs/promises";
import path from "node:path";

import { AuditAction, AuditActorType, AuditReasonType, OrganizationType } from "@prisma/client";

import { buildOrganizationCanonicalKey } from "../lib/organization-normalization";
import { prisma } from "../lib/prisma";

type SummaryRepresentative = {
  schoolName: string;
  prefecture: string;
  representativeLabel: string;
  representativeType: "prefecture" | "region";
};

type SummaryPayload = {
  representatives: SummaryRepresentative[];
};

const SCHOOL_SLUG_OVERRIDES = new Map<string, string>([
  ["西京", "hs-e5b1b1e58fa3e79c8ce7ab8b"],
  ["鹿児島工", "hs-e9b9bfe58590e5b3b6e5b7a5"],
]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const summaryArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const summaryPath = path.resolve(
    summaryArg ?? "data/imports/high-school-ekiden-2024-men/summary.json",
  );
  const summary = JSON.parse(await readFile(summaryPath, "utf8")) as SummaryPayload;

  const prefectureRepresentatives = summary.representatives.filter(
    (item) => item.representativeType === "prefecture",
  );

  const canonicalKeys = [...new Set(
    prefectureRepresentatives.map((item) =>
      buildOrganizationCanonicalKey(item.schoolName, OrganizationType.high_school),
    ),
  )];

  const organizations = await prisma.organization.findMany({
    where: {
      type: "high_school",
    },
    select: {
      id: true,
      slug: true,
      nameJa: true,
      prefecture: true,
    },
  });

  const organizationByCanonicalKey = new Map<string, typeof organizations[number]>();
  for (const organization of organizations) {
    const key = buildOrganizationCanonicalKey(organization.nameJa, OrganizationType.high_school);
    if (!canonicalKeys.includes(key)) {
      continue;
    }

    const current = organizationByCanonicalKey.get(key);
    if (!current) {
      organizationByCanonicalKey.set(key, organization);
      continue;
    }

    const currentScore = current.nameJa.length;
    const nextScore = organization.nameJa.length;
    if (nextScore > currentScore) {
      organizationByCanonicalKey.set(key, organization);
    }
  }

  const report: Array<Record<string, unknown>> = [];

  for (const representative of prefectureRepresentatives) {
    const canonicalKey = buildOrganizationCanonicalKey(
      representative.schoolName,
      OrganizationType.high_school,
    );
    const overrideSlug = SCHOOL_SLUG_OVERRIDES.get(representative.schoolName);
    const organization = overrideSlug
      ? organizations.find((item) => item.slug === overrideSlug)
      : organizationByCanonicalKey.get(canonicalKey);

    if (!organization) {
      report.push({
        schoolName: representative.schoolName,
        prefecture: representative.prefecture,
        status: "unmatched",
      });
      continue;
    }

    if (organization.prefecture === representative.prefecture) {
      report.push({
        schoolName: representative.schoolName,
        organizationSlug: organization.slug,
        organizationNameJa: organization.nameJa,
        prefecture: organization.prefecture,
        status: "already_set",
      });
      continue;
    }

    if (dryRun) {
      report.push({
        schoolName: representative.schoolName,
        organizationSlug: organization.slug,
        organizationNameJa: organization.nameJa,
        oldPrefecture: organization.prefecture,
        newPrefecture: representative.prefecture,
        status: "would_update",
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organization.id },
        data: {
          prefecture: representative.prefecture,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: "Organization",
          entityId: organization.id,
          action: AuditAction.update,
          fieldName: "prefecture",
          oldValue: organization.prefecture as never,
          newValue: representative.prefecture as never,
          reasonType: AuditReasonType.source_update,
          reasonNote: `Backfilled prefecture from national high school ekiden 2024 men prefecture representative`,
          actorType: AuditActorType.system,
        },
      });
    });

    report.push({
      schoolName: representative.schoolName,
      organizationSlug: organization.slug,
      organizationNameJa: organization.nameJa,
      oldPrefecture: organization.prefecture,
      newPrefecture: representative.prefecture,
      status: "updated",
    });
  }

  const updated = report.filter((item) => item.status === "updated").length;
  const alreadySet = report.filter((item) => item.status === "already_set").length;
  const unmatched = report.filter((item) => item.status === "unmatched").length;

  console.log(JSON.stringify({
    dryRun,
    summaryPath,
    prefectureRepresentativeRows: prefectureRepresentatives.length,
    updated,
    alreadySet,
    unmatched,
    report,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
