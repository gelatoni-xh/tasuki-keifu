import { AuditAction, AuditActorType, AuditReasonType, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

type PrefecturePatch = {
  slug: string;
  nameJa: string;
  prefecture: string;
};

const PATCHES: PrefecturePatch[] = [
  { slug: "hs-樟南高", nameJa: "樟南高", prefecture: "鹿児島県" },
  { slug: "hs-e4b889e69da1e9ab98e6a0a1", nameJa: "三条高校", prefecture: "新潟県" },
  { slug: "hs-e4b889e794b0e69dbee88196", nameJa: "三田松聖", prefecture: "兵庫県" },
  { slug: "hs-山形南高", nameJa: "山形南高", prefecture: "山形県" },
  { slug: "hs-新居浜東高", nameJa: "新居浜東高", prefecture: "愛媛県" },
  { slug: "hs-e6b395e694bfe5a4a7e5ada6", nameJa: "法政大学第二", prefecture: "神奈川県" },
  { slug: "hs-清風高", nameJa: "清風高", prefecture: "大阪府" },
  { slug: "hs-白石高", nameJa: "白石高", prefecture: "佐賀県" },
  { slug: "hs-福岡一高", nameJa: "福岡一高", prefecture: "福岡県" },
  { slug: "hs-那須拓陽高", nameJa: "那須拓陽高", prefecture: "栃木県" },
  { slug: "hs-韮山高", nameJa: "韮山高", prefecture: "静岡県" },
  { slug: "hs-鯖江高", nameJa: "鯖江高", prefecture: "福井県" },
  { slug: "hs-鹿児島高", nameJa: "鹿児島高", prefecture: "鹿児島県" },
  { slug: "hs-中部大一高", nameJa: "中部大一高", prefecture: "愛知県" },
  { slug: "hs-e4b985e68588e69db1", nameJa: "久慈東", prefecture: "岩手県" },
  { slug: "hs-e58888e8b0b7e9ab98e6a0a1", nameJa: "刈谷高校", prefecture: "愛知県" },
  { slug: "hs-千種高", nameJa: "千種高", prefecture: "愛知県" },
  { slug: "hs-城西大城西高", nameJa: "城西大城西高", prefecture: "東京都" },
  { slug: "hs-e5a7abe8b7afe59586e6a5ad", nameJa: "姫路商業", prefecture: "兵庫県" },
  { slug: "hs-宇部鴻城高", nameJa: "宇部鴻城高", prefecture: "山口県" },
  { slug: "hs-尽誠学園高", nameJa: "尽誠学園高", prefecture: "香川県" },
  { slug: "hs-島田高", nameJa: "島田高", prefecture: "静岡県" },
  { slug: "hs-愛知学院愛知高", nameJa: "愛知学院愛知高", prefecture: "愛知県" },
  { slug: "hs-e69ca8e69cac", nameJa: "木本", prefecture: "三重県" },
  { slug: "hs-東播磨高", nameJa: "東播磨高", prefecture: "兵庫県" },
  { slug: "hs-東海大静岡翔洋高", nameJa: "東海大静岡翔洋高", prefecture: "静岡県" },
  { slug: "hs-桐生高", nameJa: "桐生高", prefecture: "群馬県" },
  { slug: "hs-e6b998e58d97e5b7a5e7a791", nameJa: "湘南工科大学付属", prefecture: "神奈川県" },
  { slug: "hs-熊本工業高", nameJa: "熊本工業高", prefecture: "熊本県" },
  { slug: "hs-e7868ae69cace7acace4ba8c", nameJa: "熊本第二", prefecture: "熊本県" },
];

async function applyPatches(prismaClient: PrismaClient, patches: PrefecturePatch[]) {
  const summary = [];

  for (const patch of patches) {
    const organization = await prismaClient.organization.findUnique({
      where: { slug: patch.slug },
      select: {
        id: true,
        slug: true,
        nameJa: true,
        prefecture: true,
      },
    });

    if (!organization) {
      summary.push({ slug: patch.slug, status: "missing" });
      continue;
    }

    if (organization.nameJa !== patch.nameJa) {
      throw new Error(`Name mismatch for ${patch.slug}: expected ${patch.nameJa}, got ${organization.nameJa}`);
    }

    if (organization.prefecture === patch.prefecture) {
      summary.push({ slug: patch.slug, status: "already_set", prefecture: patch.prefecture });
      continue;
    }

    await prismaClient.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organization.id },
        data: { prefecture: patch.prefecture },
      });

      await tx.auditLog.create({
        data: {
          entityType: "Organization",
          entityId: organization.id,
          action: AuditAction.update,
          fieldName: "prefecture",
          oldValue: organization.prefecture as never,
          newValue: patch.prefecture as never,
          reasonType: AuditReasonType.source_update,
          reasonNote: `Backfilled organization prefecture for ${organization.nameJa}`,
          actorType: AuditActorType.system,
        },
      });
    });

    summary.push({ slug: patch.slug, status: "updated", prefecture: patch.prefecture });
  }

  return summary;
}

async function main() {
  const summary = await applyPatches(prisma, PATCHES);
  console.log(JSON.stringify({ updated: summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
