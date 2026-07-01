import { AuditAction, AuditActorType, AuditReasonType, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

type PrefecturePatch = {
  slug: string;
  nameJa: string;
  prefecture: string;
};

const UNIVERSITY_PATCHES: PrefecturePatch[] = [
  { slug: "org-e79a87e5adb8e9a4a8e5a4a7", nameJa: "皇學館大学", prefecture: "三重県" },
  { slug: "org-e996a2e8a5bfe5a4a7e5ada6", nameJa: "関西大学", prefecture: "大阪府" },
  { slug: "org-e4baace983bde794a3e6a5ad", nameJa: "京都産業大学", prefecture: "京都府" },
  { slug: "org-e792b0e5a4aae5b9b3e6b48b", nameJa: "環太平洋大学", prefecture: "岡山県" },
  { slug: "org-e5ba83e5b3b6e7b58ce6b888", nameJa: "広島経済大学", prefecture: "広島県" },
  { slug: "org-e7acace4b880e5b7a5e7a791", nameJa: "第一工科大学", prefecture: "鹿児島県" },
  { slug: "org-e7ab8be591bde9a4a8e5a4a7", nameJa: "立命館大学", prefecture: "京都府" },
  { slug: "org-e5a4a7e998aae7b58ce6b888", nameJa: "大阪経済大学", prefecture: "大阪府" },
  { slug: "org-e5bf97e5adb8e9a4a8e5a4a7", nameJa: "志學館大学", prefecture: "鹿児島県" },
  { slug: "org-e69cade5b98ce5ada6e999a2", nameJa: "札幌学院大学", prefecture: "北海道" },
  { slug: "org-e996a2e8a5bfe5ada6e999a2", nameJa: "関西学院大学", prefecture: "兵庫県" },
  { slug: "org-e4bfa1e5b79ee5a4a7e5ada6", nameJa: "信州大学", prefecture: "長野県" },
  { slug: "org-e5908de58fa4e5b18be5a4a7", nameJa: "名古屋大学", prefecture: "愛知県" },
  { slug: "org-e5b2a1e5b1b1e5a4a7e5ada6", nameJa: "岡山大学", prefecture: "岡山県" },
  { slug: "org-e9b9bfe5b18be4bd93e882b2", nameJa: "鹿屋体育大学", prefecture: "鹿児島県" },
  { slug: "org-e58c97e6b5b7e98193e5a4a7", nameJa: "北海道大学", prefecture: "北海道" },
  { slug: "org-e5ba83e5b3b6e5a4a7e5ada6", nameJa: "広島大学", prefecture: "広島県" },
  { slug: "org-e696b0e6bd9fe5a4a7e5ada6", nameJa: "新潟大学", prefecture: "新潟県" },
  { slug: "org-e697a5e69cace69687e79086", nameJa: "日本文理大学", prefecture: "大分県" },
];

const HIGH_SCHOOL_PATCHES: PrefecturePatch[] = [
  { slug: "hs-専大松戸高", nameJa: "専大松戸高", prefecture: "千葉県" },
  { slug: "hs-東農大二高", nameJa: "東農大二高", prefecture: "群馬県" },
  { slug: "hs-東北高", nameJa: "東北高", prefecture: "宮城県" },
  { slug: "hs-四日市工高", nameJa: "四日市工高", prefecture: "三重県" },
  { slug: "hs-松山商高", nameJa: "松山商高", prefecture: "愛媛県" },
  { slug: "hs-前橋育英高", nameJa: "前橋育英高", prefecture: "群馬県" },
  { slug: "hs-e6a89fe58d97", nameJa: "樟南", prefecture: "鹿児島県" },
  { slug: "hs-浜松日体高", nameJa: "浜松日体高", prefecture: "静岡県" },
  { slug: "hs-花咲徳栄高", nameJa: "花咲徳栄高", prefecture: "埼玉県" },
  { slug: "hs-開新高", nameJa: "開新高", prefecture: "熊本県" },
  { slug: "hs-関大北陽高", nameJa: "関大北陽高", prefecture: "大阪府" },
  { slug: "hs-三浦学苑高", nameJa: "三浦学苑高", prefecture: "神奈川県" },
  { slug: "hs-北見緑陵高", nameJa: "北見緑陵高", prefecture: "北海道" },
  { slug: "hs-e5ae87e5928ce5b3b6e69db1", nameJa: "宇和島東高校", prefecture: "愛媛県" },
  { slug: "hs-宮崎日大高", nameJa: "宮崎日大高", prefecture: "宮崎県" },
  { slug: "hs-e5b1b1e5bda2e58d97", nameJa: "山形南", prefecture: "山形県" },
  { slug: "hs-e699bae8beafe5ada6e59c92", nameJa: "智辯学園奈良カレッジ", prefecture: "奈良県" },
  { slug: "hs-東海大山形高", nameJa: "東海大山形高", prefecture: "山形県" },
  { slug: "hs-法政二高", nameJa: "法政二高", prefecture: "神奈川県" },
  { slug: "hs-流経大柏高", nameJa: "流経大柏高", prefecture: "千葉県" },
];

async function applyPatches(prismaClient: PrismaClient, patches: PrefecturePatch[], dryRun: boolean) {
  const report: Array<Record<string, unknown>> = [];

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
      report.push({
        slug: patch.slug,
        nameJa: patch.nameJa,
        status: "missing",
      });
      continue;
    }

    if (organization.nameJa !== patch.nameJa) {
      throw new Error(`Name mismatch for ${patch.slug}: expected ${patch.nameJa}, got ${organization.nameJa}`);
    }

    if (organization.prefecture === patch.prefecture) {
      report.push({
        slug: organization.slug,
        nameJa: organization.nameJa,
        status: "already_set",
        prefecture: organization.prefecture,
      });
      continue;
    }

    if (dryRun) {
      report.push({
        slug: organization.slug,
        nameJa: organization.nameJa,
        status: "would_update",
        oldPrefecture: organization.prefecture,
        newPrefecture: patch.prefecture,
      });
      continue;
    }

    await prismaClient.$transaction(async (transaction) => {
      await transaction.organization.update({
        where: { id: organization.id },
        data: {
          prefecture: patch.prefecture,
        },
      });

      await transaction.auditLog.create({
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

    report.push({
      slug: organization.slug,
      nameJa: organization.nameJa,
      status: "updated",
      oldPrefecture: organization.prefecture,
      newPrefecture: patch.prefecture,
    });
  }

  return report;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const universityReport = await applyPatches(prisma, UNIVERSITY_PATCHES, dryRun);
  const highSchoolReport = await applyPatches(prisma, HIGH_SCHOOL_PATCHES, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        universities: universityReport,
        highSchools: highSchoolReport,
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
