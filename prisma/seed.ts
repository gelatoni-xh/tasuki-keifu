import "dotenv/config";
import {
  CompetitionType,
  DataStatus,
  EventDiscipline,
  MembershipType,
  type Organization,
  OrganizationType,
  PrismaClient,
  type Race,
  SourceType,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { markToMilliseconds, upsertPersonalBestSnapshot } from "../scripts/lib/import-utils";
import { normalizeJaForLookup, normalizePersonDisplayNameJa } from "../scripts/lib/name-normalization";
import { normalizeCompetitionEditionNames } from "../scripts/lib/competition-edition-normalization";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

type SeedPersonalBest = {
  discipline: EventDiscipline;
  mark: string;
  achievedOn?: Date;
  competitionName?: string;
  venue?: string;
  notes?: string;
  sourceId: string;
};

type SeedRaceResult = {
  race: Race;
  organization: Organization;
  mark: string | null;
  rank?: number | null;
  gradeAtRace?: number;
  notes?: string | null;
  sourceId: string;
};

type SeedPlayer = {
  slug: string;
  displayNameJa: string;
  displayNameKana: string | null;
  displayNameRoman: string | null;
  birthDate: Date | null;
  hometown: string | null;
  nationality: string | null;
  university: Organization;
  highSchool: Organization;
  currentTeam: Organization | null;
  currentTeamSourceId?: string;
  grade: number;
  highSchoolStart: Date;
  highSchoolEnd: Date;
  universityStart: Date;
  universityEnd: Date;
  currentTeamStart: Date | null;
  profileStatus?: DataStatus;
  faculty?: string;
  department?: string;
  pbs: SeedPersonalBest[];
  hakoneRace?: Race;
  hakoneMark?: string | null;
  hakoneRank?: number | null;
  hakoneNotes?: string | null;
  raceResults?: SeedRaceResult[];
};

type SeedRaceEntry = {
  slug: string;
  displayNameJa: string;
  displayNameRoman: string;
  universitySlug: string;
  highSchoolSlug: string;
  grade: number;
  mark: string;
  rank: number | null;
  notes: string | null;
  pbs: Array<{
    discipline: EventDiscipline;
    mark: string;
  }>;
};

function academicDatesForGrade(grade: number) {
  const universityStartYear = 2026 - grade;

  return {
    highSchoolStart: new Date(`${universityStartYear - 3}-04-01`),
    highSchoolEnd: new Date(`${universityStartYear}-03-31`),
    universityStart: new Date(`${universityStartYear}-04-01`),
    universityEnd: new Date(`${universityStartYear + 4}-03-31`),
  };
}

async function upsertSource() {
  return prisma.source.upsert({
    where: { id: "seed-source" },
    update: {},
    create: {
      id: "seed-source",
      name: "V0.1 development seed",
      type: SourceType.manual,
      reliability: 1,
      notes: "開発用の最小サンプルデータ。正式データではない。",
    },
  });
}

async function upsertSourceById(input: {
  id: string;
  name: string;
  url?: string;
  type: SourceType;
  reliability: number;
  notes?: string;
}) {
  return prisma.source.upsert({
    where: { id: input.id },
    update: input,
    create: input,
  });
}

async function upsertOrganization(input: {
  slug: string;
  nameJa: string;
  shortName?: string;
  type: OrganizationType;
  prefecture?: string;
  country?: string;
  websiteUrl?: string;
  status?: DataStatus;
  notes?: string;
}) {
  return prisma.organization.upsert({
    where: { slug: input.slug },
    update: input,
    create: {
      ...input,
      status: input.status ?? DataStatus.pending,
    },
  });
}

async function upsertCompetition(input: {
  slug: string;
  nameJa: string;
  nameRoman?: string;
  nameZh?: string;
  nameEn?: string;
  type?: CompetitionType;
  region?: string;
  websiteUrl?: string;
}) {
  return prisma.competition.upsert({
    where: { slug: input.slug },
    update: input,
    create: input,
  });
}

async function upsertCompetitionEdition(input: {
  slug: string;
  competitionId: string;
  editionNumber?: number;
  year: number;
  officialName: string;
  shortName?: string;
  startsOn?: Date;
  endsOn?: Date;
  sourceId?: string;
}) {
  const competition = await prisma.competition.findUnique({
    where: { id: input.competitionId },
    select: { slug: true, type: true },
  });

  if (!competition) {
    throw new Error(`Missing competition for edition ${input.slug}`);
  }

  const normalizedNames = normalizeCompetitionEditionNames({
    competitionSlug: competition.slug,
    competitionType: competition.type,
    editionNumber: input.editionNumber,
    officialName: input.officialName,
    shortName: input.shortName,
  });

  return prisma.competitionEdition.upsert({
    where: { slug: input.slug },
    update: {
      ...input,
      ...normalizedNames,
    },
    create: {
      ...input,
      ...normalizedNames,
    },
  });
}

async function upsertRace(input: {
  slug: string;
  competitionEditionId: string;
  name: string;
  discipline: EventDiscipline;
  leg?: number;
  round?: string;
  heat?: string;
  distanceMeters?: number;
  startsAt?: Date;
  status?: DataStatus;
  notes?: string;
  sourceId?: string;
}) {
  return prisma.race.upsert({
    where: { slug: input.slug },
    update: input,
    create: {
      ...input,
      status: input.status ?? DataStatus.pending,
    },
  });
}

async function replaceRaceResult(input: {
  personId: string;
  organizationId?: string;
  raceId: string;
  isEntry?: boolean;
  isStarter?: boolean;
  mark?: string | null;
  markMillis?: number;
  rank?: number | null;
  teamRank?: number;
  gradeAtRace?: number;
  status?: DataStatus;
  notes?: string | null;
  sourceId?: string;
}) {
  await prisma.raceResult.deleteMany({
    where: { personId: input.personId, raceId: input.raceId },
  });

  return prisma.raceResult.create({
    data: {
      personId: input.personId,
      organizationId: input.organizationId,
      raceId: input.raceId,
      isEntry: input.isEntry ?? true,
      isStarter: input.isStarter ?? true,
      mark: input.mark,
      markMillis: input.markMillis,
      rank: input.rank,
      teamRank: input.teamRank,
      gradeAtRace: input.gradeAtRace,
      status: input.status ?? DataStatus.pending,
      notes: input.notes,
      sourceId: input.sourceId,
    },
  });
}

async function ensureSeedMembership(input: {
  personId: string;
  organizationId: string;
  type: MembershipType;
  startDate?: Date | null;
  endDate?: Date | null;
  startYear?: number | null;
  endYear?: number | null;
  faculty?: string | null;
  department?: string | null;
  status?: DataStatus;
  sourceId?: string;
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
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        startYear: input.startYear ?? null,
        endYear: input.endYear ?? null,
        faculty: input.faculty ?? null,
        department: input.department ?? null,
        status: input.status ?? DataStatus.pending,
        sourceId: input.sourceId,
      },
    });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (!existing.startDate && input.startDate) patch.startDate = input.startDate;
  if (!existing.endDate && input.endDate) patch.endDate = input.endDate;
  if (!existing.startYear && input.startYear) patch.startYear = input.startYear;
  if (!existing.endYear && input.endYear) patch.endYear = input.endYear;
  if (!existing.faculty && input.faculty) patch.faculty = input.faculty;
  if (!existing.department && input.department) patch.department = input.department;
  if (!existing.sourceId && input.sourceId) patch.sourceId = input.sourceId;

  if (Object.keys(patch).length > 0) {
    await prisma.membership.update({
      where: { id: existing.id },
      data: patch,
    });
  }
}

async function upsertSeedPerson(input: {
  slug: string;
  displayNameJa: string;
  displayNameKana?: string | null;
  displayNameRoman?: string | null;
  birthDate?: Date | null;
  hometown?: string | null;
  nationality?: string | null;
  status?: DataStatus;
}) {
  const existing = await prisma.person.findUnique({
    where: { slug: input.slug },
  });

  if (!existing) {
    const normalizedDisplayNameJa = normalizePersonDisplayNameJa(input.displayNameJa);
    return prisma.person.create({
      data: {
        slug: input.slug,
        displayNameJa: normalizedDisplayNameJa,
        displayNameJaSearch: normalizeJaForLookup(normalizedDisplayNameJa),
        displayNameKana: input.displayNameKana ?? null,
        displayNameRoman: input.displayNameRoman ?? null,
        birthDate: input.birthDate ?? null,
        hometown: input.hometown ?? null,
        nationality: input.nationality ?? null,
        type: "athlete",
        status: input.status ?? DataStatus.pending,
      },
    });
  }

  const patch: Record<string, unknown> = {};
  const normalizedDisplayNameJa = normalizePersonDisplayNameJa(input.displayNameJa);
  if (existing.displayNameJa !== normalizedDisplayNameJa) patch.displayNameJa = normalizedDisplayNameJa;
  if (existing.displayNameJaSearch !== normalizeJaForLookup(normalizedDisplayNameJa)) {
    patch.displayNameJaSearch = normalizeJaForLookup(normalizedDisplayNameJa);
  }
  if (!existing.displayNameKana && input.displayNameKana) patch.displayNameKana = input.displayNameKana;
  if (!existing.displayNameRoman && input.displayNameRoman) patch.displayNameRoman = input.displayNameRoman;
  if (!existing.birthDate && input.birthDate) patch.birthDate = input.birthDate;
  if (!existing.hometown && input.hometown) patch.hometown = input.hometown;
  if (!existing.nationality && input.nationality) patch.nationality = input.nationality;

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  return prisma.person.update({
    where: { id: existing.id },
    data: patch,
  });
}

async function main() {
  const source = await upsertSource();
  await prisma.person.deleteMany({ where: { slug: "kuroda-asahi" } });
  await prisma.organization.deleteMany({
    where: {
      slug: {
        in: [
          "taisho-university",
          "yamaguchi-gakugei-university",
          "kokushikan-university",
          "rissho-university",
          "hosei-university",
          "jobu-university",
          "senshu-university",
          "takushoku-university",
          "kurashiki-high-school",
          "seki-daiichi-high-school",
          "tokyo-nogyo-daisan-high-school",
          "hachinohe-gakuin-kosei-high-school",
          "chuo-gakuin-high-school",
          "obirin-high-school",
        ],
      },
    },
  });
  const gmoSource = await upsertSourceById({
    id: "source-gmo-kuroda-profile",
    name: "GMOインターネットグループ 陸上部 選手プロフィール",
    url: "https://athletes.gmo.jp/athletes/%E9%BB%92%E7%94%B0-%E6%9C%9D%E6%97%A5/",
    type: SourceType.manual,
    reliability: 4,
    notes: "当前所属、プロフィール、BEST RECORD の参照元。Q&A 等の軟性資料は V0.1 では入庫しない。",
  });
  const worldAthleticsSource = await upsertSourceById({
    id: "source-world-athletics-kuroda",
    name: "World Athletics athlete profile: Asahi KURODA",
    url: "https://worldathletics.org/athletes/japan/asahi-kuroda-14956041",
    type: SourceType.data_site,
    reliability: 4,
    notes: "PB の日付・会場補完に使用。国内大学赛事の更新は遅れる場合がある。",
  });
  const hakoneOfficialSource = await upsertSourceById({
    id: "source-hakone-official-kuroda-record",
    name: "箱根駅伝公式 過去の記録・選手詳細 黒田朝日",
    url: "https://www.hakone-ekiden.jp/record/record06.php?rid=7594",
    type: SourceType.hakone_official,
    reliability: 5,
    notes: "箱根正赛結果の優先ソース。",
  });
  const ntvHakone102Leg5Source = await upsertSourceById({
    id: "source-ntv-hakone-102-leg-5",
    name: "日本テレビ 第102回箱根駅伝 5区区間成績",
    url: "https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/5.html",
    type: SourceType.ntv,
    reliability: 4,
    notes: "第102回箱根駅伝 5区の区間順位、区間タイム、学年、出身校、持ちタイム摘要の参照元。",
  });
  const ntvHakone102Leg1Source = await upsertSourceById({
    id: "source-ntv-hakone-102-leg-1",
    name: "日本テレビ 第102回箱根駅伝 1区区間成績",
    url: "https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/1.html",
    type: SourceType.ntv,
    reliability: 4,
    notes: "第102回箱根駅伝 1区の区間順位、区間タイム、学年、出身校の参照元。",
  });
  const ntvHakone102Leg2Source = await upsertSourceById({
    id: "source-ntv-hakone-102-leg-2",
    name: "日本テレビ 第102回箱根駅伝 2区区間成績",
    url: "https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/2.html",
    type: SourceType.ntv,
    reliability: 4,
    notes: "第102回箱根駅伝 2区の区間順位、区間タイム、学年、出身校の参照元。",
  });
  const ntvHakone101Leg2Source = await upsertSourceById({
    id: "source-ntv-hakone-101-leg-2",
    name: "日本テレビ 第101回箱根駅伝 2区区間成績",
    url: "https://www.ntv.co.jp/hakone/backnumber/101/team_kukan/2.html",
    type: SourceType.ntv,
    reliability: 4,
    notes: "第101回箱根駅伝 2区の区間順位、区間タイム、学年、出身校、持ちタイム摘要の参照元。",
  });
  const wasedaKudoSource = await upsertSourceById({
    id: "source-waseda-kudo-profile",
    name: "早稲田大学競走部 選手プロフィール 工藤慎作",
    url: "https://waseda-ac.jp/player/kudo-shinsaku/",
    type: SourceType.university_official,
    reliability: 5,
    notes: "工藤慎作の所属、出身校、主要記録の優先ソース。",
  });
  const hakoneOfficialKudoSource = await upsertSourceById({
    id: "source-hakone-official-kudo-record",
    name: "箱根駅伝公式 過去の記録・選手詳細 工藤慎作",
    url: "https://www.hakone-ekiden.jp/record/record06.php?rid=7472",
    type: SourceType.hakone_official,
    reliability: 5,
    notes: "工藤慎作の箱根正赛結果の優先ソース。",
  });
  const wasedaMarugame2025Source = await upsertSourceById({
    id: "source-waseda-marugame-half-2025",
    name: "早稲田大学競走部 第77回香川丸亀国際ハーフマラソン",
    url: "https://waseda-ac.jp/competition/detail/464",
    type: SourceType.university_official,
    reliability: 5,
    notes: "工藤慎作のハーフ 1:00:06、総合5位、日本学生選手権1位、早稲田新記録の参照元。",
  });
  const wasedaTokyoMarathon2026Source = await upsertSourceById({
    id: "source-waseda-tokyo-marathon-2026",
    name: "早稲田大学競走部 東京マラソン2026",
    url: "https://waseda-ac.jp/competition/detail/777",
    type: SourceType.university_official,
    reliability: 5,
    notes: "工藤慎作のマラソン 2:07:34、PB、早稲田新記録の参照元。",
  });
  const wasedaFisu2025Source = await upsertSourceById({
    id: "source-waseda-fisu-2025",
    name: "早稲田大学競走部 FISUワールドユニバーシティゲームズ",
    url: "https://waseda-ac.jp/competition/detail/643",
    type: SourceType.university_official,
    reliability: 5,
    notes: "工藤慎作のFISUハーフマラソン 1:02:29、1位、大会新記録の参照元。",
  });
  const wasedaKantoIntercollegiate2026Source = await upsertSourceById({
    id: "source-waseda-kanto-intercollegiate-2026",
    name: "早稲田大学競走部 第105回関東学生陸上競技対校選手権大会",
    url: "https://waseda-ac.jp/competition/detail/869",
    type: SourceType.university_official,
    reliability: 5,
    notes: "工藤慎作の5000m 13:38.67、PB、5位の参照元。",
  });
  const nittaidai20230422Source = await upsertSourceById({
    id: "source-nittaidai-2023-04-22",
    name: "第304回日本体育大学長距離競技会 結果PDF",
    url: "https://ld.nssu-athletic.com/uploads/2023/2023-04-22_result.pdf",
    type: SourceType.pdf,
    reliability: 4,
    notes: "工藤慎作の10000m 28:31.87 の参照元。",
  });
  const rikujokyogiMarchSource = await upsertSourceById({
    id: "source-rikujokyogi-march-2025",
    name: "月陸 Online MARCH対抗戦2025",
    url: "https://www.rikujyokyogi.co.jp/archives/191658",
    type: SourceType.rikujokyogi_magazine,
    reliability: 3,
    notes: "10000m 27:37.62 の補完ソース。公式結果が見つかれば差し替え候補。",
  });
  const jaafHyogoSource = await upsertSourceById({
    id: "source-jaaf-hyogo-relay-carnival-2024",
    name: "JAAF 第72回兵庫リレーカーニバル",
    url: "https://www.jaaf.or.jp/files/competition/document/1849-7.pdf",
    type: SourceType.jaaf,
    reliability: 5,
    notes: "3000mSC 8:35.10 の公式結果参照元。",
  });
  const osakaMarathonSource = await upsertSourceById({
    id: "source-osaka-marathon-2025",
    name: "大阪マラソン2025 結果資料",
    url: "https://www.osaka-marathon.com/2026/info/history/pdf/material43.pdf",
    type: SourceType.pdf,
    reliability: 4,
    notes: "マラソン 2:06:05、日本学生最高記録の参照元。",
  });
  const izumoOfficialSource = await upsertSourceById({
    id: "source-izumo-ekiden-35-leg-2",
    name: "出雲駅伝公式 第35回 2区区間記録",
    url: "https://www.izumo-ekiden.jp/35/record/2b.html",
    type: SourceType.data_site,
    reliability: 5,
    notes: "第35回出雲駅伝 2区の公式区間記録。",
  });
  const izumoOfficial36Leg6Source = await upsertSourceById({
    id: "source-izumo-ekiden-36-leg-6",
    name: "出雲駅伝公式 第36回 6区区間記録",
    url: "https://www.izumo-ekiden.jp/36/record/6b.html",
    type: SourceType.data_site,
    reliability: 5,
    notes: "第36回出雲駅伝 6区の公式区間記録。",
  });
  const izumoOfficial37Leg6Source = await upsertSourceById({
    id: "source-izumo-ekiden-37-leg-6",
    name: "出雲駅伝公式 第37回 6区区間記録",
    url: "https://www.izumo-ekiden.jp/37/record/6b.html",
    type: SourceType.data_site,
    reliability: 5,
    notes: "第37回出雲駅伝 6区の公式区間記録。",
  });
  const allJapanEkiden57Source = await upsertSourceById({
    id: "source-all-japan-university-ekiden-57",
    name: "全日本大学駅伝公式 第57回大会成績PDF",
    url: "https://daigaku-ekiden.com/files/2025_result.pdf",
    type: SourceType.pdf,
    reliability: 5,
    notes: "第57回全日本大学駅伝 8区、工藤慎作 56:54、区間1位の参照元。",
  });
  const allJapanEkiden55Source = await upsertSourceById({
    id: "source-all-japan-university-ekiden-55",
    name: "全日本大学駅伝公式 第55回大会成績PDF",
    url: "https://daigaku-ekiden.com/result/result.pdf",
    type: SourceType.pdf,
    reliability: 5,
    notes: "第55回全日本大学駅伝 4区、工藤慎作 35:36、区間13位の公式PDF参照元。",
  });
  const allJapanEkiden56Source = await upsertSourceById({
    id: "source-all-japan-university-ekiden-56",
    name: "全日本大学駅伝公式 第56回大会成績PDF",
    url: "https://daigaku-ekiden.com/datafile/files/2024result.pdf",
    type: SourceType.pdf,
    reliability: 5,
    notes: "第56回全日本大学駅伝 8区、工藤慎作 58:12、区間3位の公式PDF参照元。",
  });
  const nationalHighSchoolEkiden2025MenSource = await upsertSourceById({
    id: "source-jaaf-koko-ekiden-2025-men-result",
    name: "JAAF 第76回全国高等学校駅伝競走大会 男子総合成績PDF",
    url: "https://www.jaaf.or.jp/files/upload/202512/21_150042.pdf",
    type: SourceType.jaaf,
    reliability: 5,
    notes: "2025年12月21日開催、第76回全国高等学校駅伝競走大会 男子の公式総合成績PDF。",
  });
  const newYearEkiden66Source = await upsertSourceById({
    id: "source-new-year-ekiden-66-result",
    name: "JAIC 第66回ニューイヤー駅伝総合成績HTML",
    url: "https://gold.jaic.org/gunma/menu/results/r_22/r220101/rel001.html",
    type: SourceType.data_site,
    reliability: 5,
    notes: "2022年1月1日開催、第66回全日本実業団対抗駅伝競走大会のJAIC総合成績HTML。",
  });
  const newYearEkiden67Source = await upsertSourceById({
    id: "source-new-year-ekiden-67-result",
    name: "JAIC 第67回ニューイヤー駅伝総合成績HTML",
    url: "https://gold.jaic.org/jaic/res2023/nyeki/pcsp/rel001.html",
    type: SourceType.data_site,
    reliability: 5,
    notes: "2023年1月1日開催、第67回全日本実業団対抗駅伝競走大会のJAIC総合成績HTML。",
  });
  const newYearEkiden69Source = await upsertSourceById({
    id: "source-new-year-ekiden-69-result",
    name: "JAIC 第69回ニューイヤー駅伝総合成績HTML",
    url: "https://gold.jaic.org/gunma/menu/results/r_25/r250101/rel001.html",
    type: SourceType.data_site,
    reliability: 5,
    notes: "2025年1月1日開催、第69回全日本実業団対抗駅伝競走大会のJAIC総合成績HTML。",
  });

  const aogaku = await upsertOrganization({
    slug: "aoyama-gakuin-university",
    nameJa: "青山学院大学",
    shortName: "青学大",
    type: OrganizationType.university,
    prefecture: "東京都",
    websiteUrl: "https://aogaku-tf.com/",
  });
  await upsertOrganization({
    slug: "kanebo",
    nameJa: "カネボウ",
    type: OrganizationType.corporate_team,
    country: "JP",
    status: DataStatus.pending,
    notes: "ニューイヤー駅伝実業団チーム初期整備。",
  });
  await upsertOrganization({
    slug: "komori-corporation",
    nameJa: "小森コーポレーション",
    type: OrganizationType.corporate_team,
    country: "JP",
    status: DataStatus.pending,
    notes: "ニューイヤー駅伝実業団チーム初期整備。",
  });
  const kokugakuin = await upsertOrganization({
    slug: "kokugakuin-university",
    nameJa: "國學院大學",
    shortName: "國學院大",
    type: OrganizationType.university,
    prefecture: "東京都",
    websiteUrl: "https://www.kokugakuin.com/",
  });
  const chuo = await upsertOrganization({
    slug: "chuo-university",
    nameJa: "中央大学",
    shortName: "中大",
    type: OrganizationType.university,
    prefecture: "東京都",
    websiteUrl: "https://chuo-tf.com/",
  });
  const waseda = await upsertOrganization({
    slug: "waseda-university",
    nameJa: "早稲田大学",
    shortName: "早大",
    type: OrganizationType.university,
    prefecture: "東京都",
    websiteUrl: "https://waseda-ac.jp/",
  });
  const juntendo = await upsertOrganization({
    slug: "juntendo-university",
    nameJa: "順天堂大学",
    shortName: "順大",
    type: OrganizationType.university,
    prefecture: "千葉県",
  });
  const soka = await upsertOrganization({
    slug: "soka-university",
    nameJa: "創価大学",
    shortName: "創価大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const tokai = await upsertOrganization({
    slug: "tokai-university",
    nameJa: "東海大学",
    shortName: "東海大",
    type: OrganizationType.university,
    prefecture: "神奈川県",
  });
  const komazawa = await upsertOrganization({
    slug: "komazawa-university",
    nameJa: "駒澤大学",
    shortName: "駒大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const kanagawa = await upsertOrganization({
    slug: "kanagawa-university",
    nameJa: "神奈川大学",
    shortName: "神奈川大",
    type: OrganizationType.university,
    prefecture: "神奈川県",
  });
  const teikyo = await upsertOrganization({
    slug: "teikyo-university",
    nameJa: "帝京大学",
    shortName: "帝京大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const nihon = await upsertOrganization({
    slug: "nihon-university",
    nameJa: "日本大学",
    shortName: "日大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const nipponSportScience = await upsertOrganization({
    slug: "nippon-sport-science-university",
    nameJa: "日本体育大学",
    shortName: "日体大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const chuoGakuin = await upsertOrganization({
    slug: "chuo-gakuin-university",
    nameJa: "中央学院大学",
    shortName: "中央学大",
    type: OrganizationType.university,
    prefecture: "千葉県",
  });
  const tokyoNogyo = await upsertOrganization({
    slug: "tokyo-university-of-agriculture",
    nameJa: "東京農業大学",
    shortName: "東農大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const josai = await upsertOrganization({
    slug: "josai-university",
    nameJa: "城西大学",
    shortName: "城西大",
    type: OrganizationType.university,
    prefecture: "埼玉県",
  });
  const tokyoInternational = await upsertOrganization({
    slug: "tokyo-international-university",
    nameJa: "東京国際大学",
    shortName: "東京国際大",
    type: OrganizationType.university,
    prefecture: "埼玉県",
  });
  const toyo = await upsertOrganization({
    slug: "toyo-university",
    nameJa: "東洋大学",
    shortName: "東洋大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const yamanashiGakuin = await upsertOrganization({
    slug: "yamanashi-gakuin-university",
    nameJa: "山梨学院大学",
    shortName: "山梨学院大",
    type: OrganizationType.university,
    prefecture: "山梨県",
  });
  const daitoBunka = await upsertOrganization({
    slug: "daito-bunka-university",
    nameJa: "大東文化大学",
    shortName: "大東文化大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const rikkyo = await upsertOrganization({
    slug: "rikkyo-university",
    nameJa: "立教大学",
    shortName: "立教大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const hosei = await upsertOrganization({
    slug: "hosei-university",
    nameJa: "法政大学",
    shortName: "法大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const senshu = await upsertOrganization({
    slug: "senshu-university",
    nameJa: "専修大学",
    shortName: "専大",
    type: OrganizationType.university,
    prefecture: "東京都",
  });
  const kantoStudentUnion = await upsertOrganization({
    slug: "kanto-student-union",
    nameJa: "関東学生連合",
    shortName: "関東学生連合",
    type: OrganizationType.club,
    prefecture: "東京都",
  });
  const gmo = await upsertOrganization({
    slug: "gmo-internet-group",
    nameJa: "GMOインターネットグループ",
    shortName: "GMO",
    type: OrganizationType.corporate_team,
    websiteUrl: "https://athletes.gmo.jp/",
  });

  const tamano = await upsertOrganization({
    slug: "tamano-konan-high-school",
    nameJa: "玉野光南高校",
    type: OrganizationType.high_school,
    prefecture: "岡山県",
  });
  const mikata = await upsertOrganization({
    slug: "mikata-high-school",
    nameJa: "美方高校",
    type: OrganizationType.high_school,
    prefecture: "福井県",
  });
  const sendaiIkuei = await upsertOrganization({
    slug: "sendai-ikuei-high-school",
    nameJa: "仙台育英高校",
    type: OrganizationType.high_school,
    prefecture: "宮城県",
  });
  const shigaGakuen = await upsertOrganization({
    slug: "shiga-gakuen-high-school",
    nameJa: "滋賀学園高校",
    type: OrganizationType.high_school,
    prefecture: "滋賀県",
  });
  const kochiTechnical = await upsertOrganization({
    slug: "kochi-technical-high-school",
    nameJa: "高知工業高校",
    type: OrganizationType.high_school,
    prefecture: "高知県",
  });
  const yachiyoShoin = await upsertOrganization({
    slug: "yachiyo-shoin-high-school",
    nameJa: "八千代松陰高校",
    type: OrganizationType.high_school,
    prefecture: "千葉県",
  });
  const rakunan = await upsertOrganization({
    slug: "rakunan-high-school",
    nameJa: "洛南高校",
    type: OrganizationType.high_school,
    prefecture: "京都府",
  });
  const tsurugaKehi = await upsertOrganization({
    slug: "tsuruga-kehi-high-school",
    nameJa: "敦賀気比高校",
    type: OrganizationType.high_school,
    prefecture: "福井県",
  });
  const rifu = await upsertOrganization({
    slug: "rifu-high-school",
    nameJa: "利府高校",
    type: OrganizationType.high_school,
    prefecture: "宮城県",
  });
  const fujisawaShoryo = await upsertOrganization({
    slug: "fujisawa-shoryo-high-school",
    nameJa: "藤沢翔陵高校",
    type: OrganizationType.high_school,
    prefecture: "神奈川県",
  });
  const toyoUshiku = await upsertOrganization({
    slug: "toyo-university-ushiku-high-school",
    nameJa: "東洋大牛久高校",
    type: OrganizationType.high_school,
    prefecture: "茨城県",
  });
  const abiko = await upsertOrganization({
    slug: "abiko-high-school",
    nameJa: "我孫子高校",
    type: OrganizationType.high_school,
    prefecture: "千葉県",
  });
  const kasukabeHigashi = await upsertOrganization({
    slug: "kasukabe-higashi-high-school",
    nameJa: "春日部東高校",
    type: OrganizationType.high_school,
    prefecture: "埼玉県",
  });
  const chuetsu = await upsertOrganization({
    slug: "chuetsu-high-school",
    nameJa: "中越高校",
    type: OrganizationType.high_school,
    prefecture: "新潟県",
  });
  const kyushuGakuin = await upsertOrganization({
    slug: "kyushu-gakuin-high-school",
    nameJa: "九州学院高校",
    type: OrganizationType.high_school,
    prefecture: "熊本県",
  });
  const musashiOgose = await upsertOrganization({
    slug: "musashi-ogose-high-school",
    nameJa: "武蔵越生高校",
    type: OrganizationType.high_school,
    prefecture: "埼玉県",
  });
  const hidaka = await upsertOrganization({
    slug: "hidaka-high-school",
    nameJa: "日高高校",
    type: OrganizationType.high_school,
    prefecture: "和歌山県",
  });
  const nishiwakiTechnical = await upsertOrganization({
    slug: "nishiwaki-technical-high-school",
    nameJa: "西脇工業高校",
    type: OrganizationType.high_school,
    prefecture: "兵庫県",
  });
  const soyo = await upsertOrganization({
    slug: "soyo-high-school",
    nameJa: "相洋高校",
    type: OrganizationType.high_school,
    prefecture: "神奈川県",
  });
  const matsuyama = await upsertOrganization({
    slug: "matsuyama-high-school",
    nameJa: "松山高校",
    type: OrganizationType.high_school,
    prefecture: "埼玉県",
  });
  const tomisato = await upsertOrganization({
    slug: "tomisato-high-school",
    nameJa: "富里高校",
    type: OrganizationType.high_school,
    prefecture: "千葉県",
  });
  const mauHigh = await upsertOrganization({
    slug: "mau-high-school",
    nameJa: "マウ高校",
    type: OrganizationType.high_school,
    prefecture: "ケニア",
  });
  const ichiritsuFunabashi = await upsertOrganization({
    slug: "ichiritsu-funabashi-high-school",
    nameJa: "市船橋高校",
    type: OrganizationType.high_school,
    prefecture: "千葉県",
  });
  const kokugakuinKugayama = await upsertOrganization({
    slug: "kokugakuin-kugayama-high-school",
    nameJa: "國學院久我山高校",
    type: OrganizationType.high_school,
    prefecture: "東京都",
  });
  const gakuhoIshikawa = await upsertOrganization({
    slug: "gakuho-ishikawa-high-school",
    nameJa: "学法石川高校",
    type: OrganizationType.high_school,
    prefecture: "福島県",
  });
  const tokaiUniversityShoyo = await upsertOrganization({
    slug: "tokai-university-shoyo-high-school",
    nameJa: "東海大翔洋高校",
    type: OrganizationType.high_school,
    prefecture: "静岡県",
  });
  const kusatsuHigashi = await upsertOrganization({
    slug: "kusatsu-higashi-high-school",
    nameJa: "草津東高校",
    type: OrganizationType.high_school,
    prefecture: "滋賀県",
  });
  const hirosakiJitsugyo = await upsertOrganization({
    slug: "hirosaki-jitsugyo-high-school",
    nameJa: "弘前実業高校",
    type: OrganizationType.high_school,
    prefecture: "青森県",
  });
  const omuta = await upsertOrganization({
    slug: "omuta-high-school",
    nameJa: "大牟田高校",
    type: OrganizationType.high_school,
    prefecture: "福岡県",
  });
  const senshuUniversityKumamoto = await upsertOrganization({
    slug: "senshu-university-kumamoto-high-school",
    nameJa: "専大熊本高校",
    type: OrganizationType.high_school,
    prefecture: "熊本県",
  });
  const ngongHigh = await upsertOrganization({
    slug: "ngong-high-school",
    nameJa: "ンゴニ高校",
    type: OrganizationType.high_school,
    prefecture: "ケニア",
  });
  const takudaiKoryo = await upsertOrganization({
    slug: "takudai-koryo-high-school",
    nameJa: "拓大紅陵高校",
    type: OrganizationType.high_school,
    prefecture: "千葉県",
  });
  const irigitatiHigh = await upsertOrganization({
    slug: "irigitati-high-school",
    nameJa: "イリギタティ高校",
    type: OrganizationType.high_school,
    prefecture: "ケニア",
  });
  const silHigh = await upsertOrganization({
    slug: "sil-high-school",
    nameJa: "シル高校",
    type: OrganizationType.high_school,
    prefecture: "ケニア",
  });
  const izumiChuo = await upsertOrganization({
    slug: "izumi-chuo-high-school",
    nameJa: "出水中央高校",
    type: OrganizationType.high_school,
    prefecture: "鹿児島県",
  });
  const kojokan = await upsertOrganization({
    slug: "kojokan-high-school",
    nameJa: "興譲館高校",
    type: OrganizationType.high_school,
    prefecture: "岡山県",
  });
  const kurashiki = await upsertOrganization({
    slug: "kurashiki-high-school",
    nameJa: "倉敷高校",
    type: OrganizationType.high_school,
    prefecture: "岡山県",
  });
  const saitamaSakae = await upsertOrganization({
    slug: "saitama-sakae-high-school",
    nameJa: "埼玉栄高校",
    type: OrganizationType.high_school,
    prefecture: "埼玉県",
  });
  const kentaTakasaki = await upsertOrganization({
    slug: "kenta-takasaki-high-school",
    nameJa: "健大高崎高校",
    type: OrganizationType.high_school,
    prefecture: "群馬県",
  });
  const wasedaJitsugyo = await upsertOrganization({
    slug: "waseda-jitsugyo-high-school",
    nameJa: "早稲田実業学校高等部",
    type: OrganizationType.high_school,
    prefecture: "東京都",
  });
  const suijo = await upsertOrganization({
    slug: "suijo-high-school",
    nameJa: "水城高校",
    type: OrganizationType.high_school,
    prefecture: "茨城県",
  });
  const osakaHigh = await upsertOrganization({
    slug: "osaka-high-school",
    nameJa: "大阪高校",
    type: OrganizationType.high_school,
    prefecture: "大阪府",
  });
  const toyokawa = await upsertOrganization({
    slug: "toyokawa-high-school",
    nameJa: "豊川高校",
    type: OrganizationType.high_school,
    prefecture: "愛知県",
  });
  const kobayashi = await upsertOrganization({
    slug: "kobayashi-high-school",
    nameJa: "小林高校",
    type: OrganizationType.high_school,
    prefecture: "宮崎県",
  });
  const kagoshimaJitsugyo = await upsertOrganization({
    slug: "kagoshima-jitsugyo-high-school",
    nameJa: "鹿児島実業高校",
    type: OrganizationType.high_school,
    prefecture: "鹿児島県",
  });
  const sanoNichidai = await upsertOrganization({
    slug: "sano-nichidai-high-school",
    nameJa: "佐野日本大学高校",
    type: OrganizationType.high_school,
    prefecture: "栃木県",
  });
  const gifuShotoku = await upsertOrganization({
    slug: "gifu-shotoku-high-school",
    nameJa: "県岐阜商業高校",
    type: OrganizationType.high_school,
    prefecture: "岐阜県",
  });
  const aichiHigh = await upsertOrganization({
    slug: "aichi-high-school",
    nameJa: "愛知高校",
    type: OrganizationType.high_school,
    prefecture: "愛知県",
  });
  const hiroshimaKokusaiGakuin = await upsertOrganization({
    slug: "hiroshima-kokusai-gakuin-high-school",
    nameJa: "広島国際学院高校",
    type: OrganizationType.high_school,
    prefecture: "広島県",
  });
  const tokaiUniversityOsakaGyosei = await upsertOrganization({
    slug: "tokai-university-osaka-gyosei-high-school",
    nameJa: "東海大大阪仰星高校",
    type: OrganizationType.high_school,
    prefecture: "大阪府",
  });
  const kapkatet = await upsertOrganization({
    slug: "kapkatet-high-school",
    nameJa: "カプカテット高校",
    type: OrganizationType.high_school,
    prefecture: "ケニア",
  });
  const mikuyuni = await upsertOrganization({
    slug: "mikuyuni-high-school",
    nameJa: "ミクユニ高校",
    type: OrganizationType.high_school,
    prefecture: "ケニア",
  });
  const uedaNishi = await upsertOrganization({
    slug: "ueda-nishi-high-school",
    nameJa: "上田西高校",
    type: OrganizationType.high_school,
    prefecture: "長野県",
  });
  const igaHakuho = await upsertOrganization({
    slug: "iga-hakuho-high-school",
    nameJa: "伊賀白鳳高校",
    type: OrganizationType.high_school,
    prefecture: "三重県",
  });
  const sakuChosei = await upsertOrganization({
    slug: "saku-chosei-high-school",
    nameJa: "佐久長聖高校",
    type: OrganizationType.high_school,
    prefecture: "長野県",
  });
  const hokuzan = await upsertOrganization({
    slug: "hokuzan-high-school",
    nameJa: "北山高校",
    type: OrganizationType.high_school,
    prefecture: "沖縄県",
  });
  const hotokuGakuen = await upsertOrganization({
    slug: "hotoku-gakuen-high-school",
    nameJa: "報徳学園高校",
    type: OrganizationType.high_school,
    prefecture: "兵庫県",
  });
  const koma = await upsertOrganization({
    slug: "koma-high-school",
    nameJa: "巨摩高校",
    type: OrganizationType.high_school,
    prefecture: "山梨県",
  });
  const keisei = await upsertOrganization({
    slug: "keisei-high-school",
    nameJa: "慶誠高校",
    type: OrganizationType.high_school,
    prefecture: "熊本県",
  });
  const asahino = await upsertOrganization({
    slug: "asahino-high-school",
    nameJa: "旭野高校",
    type: OrganizationType.high_school,
    prefecture: "愛知県",
  });
  const jiyugaoka = await upsertOrganization({
    slug: "jiyugaoka-high-school",
    nameJa: "自由ケ丘高校",
    type: OrganizationType.high_school,
    prefecture: "福岡県",
  });

  const hakone = await upsertCompetition({
    slug: "hakone-ekiden",
    nameJa: "東京箱根間往復大学駅伝競走",
    nameRoman: "Hakone Ekiden",
    nameZh: "箱根驿传",
    type: "university_ekiden",
    region: "関東",
    websiteUrl: "https://www.hakone-ekiden.jp/",
  });

  const hakone100 = await upsertCompetitionEdition({
    slug: "hakone-ekiden-100",
    competitionId: hakone.id,
    editionNumber: 100,
    year: 2024,
    officialName: "第100回東京箱根間往復大学駅伝競走",
    shortName: "第100回箱根駅伝",
    startsOn: new Date("2024-01-02"),
    endsOn: new Date("2024-01-03"),
    sourceId: hakoneOfficialSource.id,
  });
  const hakone101 = await upsertCompetitionEdition({
    slug: "hakone-ekiden-101",
    competitionId: hakone.id,
    editionNumber: 101,
    year: 2025,
    officialName: "第101回東京箱根間往復大学駅伝競走",
    shortName: "第101回箱根駅伝",
    startsOn: new Date("2025-01-02"),
    endsOn: new Date("2025-01-03"),
    sourceId: hakoneOfficialSource.id,
  });
  const hakone102 = await upsertCompetitionEdition({
    slug: "hakone-ekiden-102",
    competitionId: hakone.id,
    editionNumber: 102,
    year: 2026,
    officialName: "第102回東京箱根間往復大学駅伝競走",
    shortName: "第102回箱根駅伝",
    startsOn: new Date("2026-01-02"),
    endsOn: new Date("2026-01-03"),
    sourceId: hakoneOfficialSource.id,
  });

  const hakone100Leg2 = await upsertRace({
    slug: "hakone-ekiden-100-leg-2",
    competitionEditionId: hakone100.id,
    name: "2区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 2,
    sourceId: hakoneOfficialSource.id,
  });
  const hakone100Leg5 = await upsertRace({
    slug: "hakone-ekiden-100-leg-5",
    competitionEditionId: hakone100.id,
    name: "5区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 5,
    sourceId: hakoneOfficialKudoSource.id,
  });
  const hakone101Leg1 = await upsertRace({
    slug: "hakone-ekiden-101-leg-1",
    competitionEditionId: hakone101.id,
    name: "1区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 1,
    sourceId: source.id,
  });
  const hakone101Leg2 = await upsertRace({
    slug: "hakone-ekiden-101-leg-2",
    competitionEditionId: hakone101.id,
    name: "2区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 2,
    sourceId: hakoneOfficialSource.id,
  });
  const hakone101Leg5 = await upsertRace({
    slug: "hakone-ekiden-101-leg-5",
    competitionEditionId: hakone101.id,
    name: "5区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 5,
    sourceId: hakoneOfficialKudoSource.id,
  });
  const hakone102Leg1 = await upsertRace({
    slug: "hakone-ekiden-102-leg-1",
    competitionEditionId: hakone102.id,
    name: "1区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 1,
    sourceId: ntvHakone102Leg1Source.id,
  });
  const hakone102Leg2 = await upsertRace({
    slug: "hakone-ekiden-102-leg-2",
    competitionEditionId: hakone102.id,
    name: "2区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 2,
    sourceId: ntvHakone102Leg2Source.id,
  });
  const hakone102Leg5 = await upsertRace({
    slug: "hakone-ekiden-102-leg-5",
    competitionEditionId: hakone102.id,
    name: "5区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 5,
    sourceId: hakoneOfficialSource.id,
  });

  const izumo = await upsertCompetition({
    slug: "izumo-ekiden",
    nameJa: "出雲全日本大学選抜駅伝競走",
    nameRoman: "Izumo Ekiden",
    nameZh: "出云驿传",
    type: "university_ekiden",
    region: "島根県",
    websiteUrl: "https://www.izumo-ekiden.jp/",
  });
  const izumo35 = await upsertCompetitionEdition({
    slug: "izumo-ekiden-35",
    competitionId: izumo.id,
    editionNumber: 35,
    year: 2023,
    officialName: "第35回出雲全日本大学選抜駅伝競走",
    shortName: "第35回出雲駅伝",
    startsOn: new Date("2023-10-09"),
    sourceId: izumoOfficialSource.id,
  });
  const izumo35Leg2 = await upsertRace({
    slug: "izumo-ekiden-35-leg-2",
    competitionEditionId: izumo35.id,
    name: "2区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 2,
    sourceId: izumoOfficialSource.id,
  });
  const izumo36 = await upsertCompetitionEdition({
    slug: "izumo-ekiden-36",
    competitionId: izumo.id,
    editionNumber: 36,
    year: 2024,
    officialName: "第36回出雲全日本大学選抜駅伝競走",
    shortName: "第36回出雲駅伝",
    startsOn: new Date("2024-10-14"),
    sourceId: izumoOfficial36Leg6Source.id,
  });
  const izumo36Leg6 = await upsertRace({
    slug: "izumo-ekiden-36-leg-6",
    competitionEditionId: izumo36.id,
    name: "6区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 6,
    sourceId: izumoOfficial36Leg6Source.id,
  });
  const izumo37 = await upsertCompetitionEdition({
    slug: "izumo-ekiden-37",
    competitionId: izumo.id,
    editionNumber: 37,
    year: 2025,
    officialName: "第37回出雲全日本大学選抜駅伝競走",
    shortName: "第37回出雲駅伝",
    startsOn: new Date("2025-10-13"),
    sourceId: izumoOfficial37Leg6Source.id,
  });
  const izumo37Leg6 = await upsertRace({
    slug: "izumo-ekiden-37-leg-6",
    competitionEditionId: izumo37.id,
    name: "6区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 6,
    sourceId: izumoOfficial37Leg6Source.id,
  });

  const allJapanUniversityEkiden = await upsertCompetition({
    slug: "all-japan-university-ekiden",
    nameJa: "全日本大学駅伝対校選手権大会",
    nameRoman: "All Japan University Ekiden",
    nameZh: "全日本大学驿传",
    type: "university_ekiden",
    region: "東海",
    websiteUrl: "https://daigaku-ekiden.com/",
  });
  const allJapanUniversityEkiden55 = await upsertCompetitionEdition({
    slug: "all-japan-university-ekiden-55",
    competitionId: allJapanUniversityEkiden.id,
    editionNumber: 55,
    year: 2023,
    officialName: "秩父宮賜杯 第55回全日本大学駅伝対校選手権大会",
    shortName: "第55回全日本大学駅伝",
    startsOn: new Date("2023-11-05"),
    sourceId: allJapanEkiden55Source.id,
  });
  const allJapanUniversityEkiden55Leg4 = await upsertRace({
    slug: "all-japan-university-ekiden-55-leg-4",
    competitionEditionId: allJapanUniversityEkiden55.id,
    name: "4区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 4,
    sourceId: allJapanEkiden55Source.id,
  });
  const allJapanUniversityEkiden56 = await upsertCompetitionEdition({
    slug: "all-japan-university-ekiden-56",
    competitionId: allJapanUniversityEkiden.id,
    editionNumber: 56,
    year: 2024,
    officialName: "秩父宮賜杯 第56回全日本大学駅伝対校選手権大会",
    shortName: "第56回全日本大学駅伝",
    startsOn: new Date("2024-11-03"),
    sourceId: allJapanEkiden56Source.id,
  });
  const allJapanUniversityEkiden56Leg8 = await upsertRace({
    slug: "all-japan-university-ekiden-56-leg-8",
    competitionEditionId: allJapanUniversityEkiden56.id,
    name: "8区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 8,
    sourceId: allJapanEkiden56Source.id,
  });
  const allJapanUniversityEkiden57 = await upsertCompetitionEdition({
    slug: "all-japan-university-ekiden-57",
    competitionId: allJapanUniversityEkiden.id,
    editionNumber: 57,
    year: 2025,
    officialName: "秩父宮賜杯 第57回全日本大学駅伝対校選手権大会",
    shortName: "第57回全日本大学駅伝",
    startsOn: new Date("2025-11-02"),
    sourceId: allJapanEkiden57Source.id,
  });
  const allJapanUniversityEkiden57Leg8 = await upsertRace({
    slug: "all-japan-university-ekiden-57-leg-8",
    competitionEditionId: allJapanUniversityEkiden57.id,
    name: "8区",
    discipline: EventDiscipline.ekiden_leg,
    leg: 8,
    sourceId: allJapanEkiden57Source.id,
  });

  const nationalHighSchoolEkiden = await upsertCompetition({
    slug: "national-high-school-ekiden",
    nameJa: "全国高等学校駅伝競走大会",
    nameRoman: "National High School Ekiden",
    nameZh: "全国高中驿传",
    type: "high_school_ekiden",
    region: "京都府",
    websiteUrl: "https://www.jaaf.or.jp/competition/detail/1993/",
  });
  const newYearEkiden = await upsertCompetition({
    slug: "new-year-ekiden",
    nameJa: "全日本実業団対抗駅伝競走大会",
    nameRoman: "New Year Ekiden",
    nameZh: "全日本实业团对抗驿传",
    type: "corporate_ekiden",
    region: "群馬県",
    websiteUrl: "https://www.jita-trackfield.jp/",
  });
  const newYearEkiden66 = await upsertCompetitionEdition({
    slug: "new-year-ekiden-66",
    competitionId: newYearEkiden.id,
    editionNumber: 66,
    year: 2022,
    officialName: "第66回全日本実業団対抗駅伝競走大会",
    shortName: "ニューイヤー駅伝2022",
    startsOn: new Date("2022-01-01"),
    sourceId: newYearEkiden66Source.id,
  });
  await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      upsertRace({
        slug: `new-year-ekiden-66-leg-${index + 1}`,
        competitionEditionId: newYearEkiden66.id,
        name: `${index + 1}区`,
        discipline: EventDiscipline.ekiden_leg,
        leg: index + 1,
        sourceId: newYearEkiden66Source.id,
      }),
    ),
  );
  const newYearEkiden67 = await upsertCompetitionEdition({
    slug: "new-year-ekiden-67",
    competitionId: newYearEkiden.id,
    editionNumber: 67,
    year: 2023,
    officialName: "第67回全日本実業団対抗駅伝競走大会",
    shortName: "ニューイヤー駅伝2023",
    startsOn: new Date("2023-01-01"),
    sourceId: newYearEkiden67Source.id,
  });
  await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      upsertRace({
        slug: `new-year-ekiden-67-leg-${index + 1}`,
        competitionEditionId: newYearEkiden67.id,
        name: `${index + 1}区`,
        discipline: EventDiscipline.ekiden_leg,
        leg: index + 1,
        sourceId: newYearEkiden67Source.id,
      }),
    ),
  );
  const newYearEkiden69 = await upsertCompetitionEdition({
    slug: "new-year-ekiden-69",
    competitionId: newYearEkiden.id,
    editionNumber: 69,
    year: 2025,
    officialName: "第69回全日本実業団対抗駅伝競走大会",
    shortName: "ニューイヤー駅伝2025",
    startsOn: new Date("2025-01-01"),
    sourceId: newYearEkiden69Source.id,
  });
  await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      upsertRace({
        slug: `new-year-ekiden-69-leg-${index + 1}`,
        competitionEditionId: newYearEkiden69.id,
        name: `${index + 1}区`,
        discipline: EventDiscipline.ekiden_leg,
        leg: index + 1,
        sourceId: newYearEkiden69Source.id,
      }),
    ),
  );
  const nationalHighSchoolEkiden2025Men = await upsertCompetitionEdition({
    slug: "national-high-school-ekiden-2025-men",
    competitionId: nationalHighSchoolEkiden.id,
    editionNumber: 76,
    year: 2025,
    officialName: "男子第76回全国高等学校駅伝競走大会",
    shortName: "全国高校駅伝2025 男子",
    startsOn: new Date("2025-12-21"),
    sourceId: nationalHighSchoolEkiden2025MenSource.id,
  });
  await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      upsertRace({
        slug: `national-high-school-ekiden-2025-men-leg-${index + 1}`,
        competitionEditionId: nationalHighSchoolEkiden2025Men.id,
        name: `${index + 1}区`,
        discipline: EventDiscipline.ekiden_leg,
        leg: index + 1,
        sourceId: nationalHighSchoolEkiden2025MenSource.id,
      }),
    ),
  );

  const march = await upsertCompetition({
    slug: "march-taikosen",
    nameJa: "MARCH対抗戦",
    nameRoman: "MARCH Taikosen",
    type: "track_meet",
    region: "東京都",
  });
  const march2025 = await upsertCompetitionEdition({
    slug: "march-taikosen-2025",
    competitionId: march.id,
    year: 2025,
    officialName: "MARCH対抗戦2025",
    shortName: "MARCH対抗戦2025",
    startsOn: new Date("2025-11-22"),
    sourceId: rikujokyogiMarchSource.id,
  });
  const march2025M10000Heat4 = await upsertRace({
    slug: "march-taikosen-2025-men-10000m-heat-4",
    competitionEditionId: march2025.id,
    name: "男子10000m 最終4組",
    discipline: EventDiscipline.m10000,
    heat: "4組",
    distanceMeters: 10000,
    startsAt: new Date("2025-11-22"),
    sourceId: rikujokyogiMarchSource.id,
  });

  const hyogoRelay = await upsertCompetition({
    slug: "hyogo-relay-carnival",
    nameJa: "兵庫リレーカーニバル",
    nameRoman: "Hyogo Relay Carnival",
    type: "track_meet",
    region: "兵庫県",
    websiteUrl: "https://www.jaaf.or.jp/gp-series/",
  });
  const hyogoRelay72 = await upsertCompetitionEdition({
    slug: "hyogo-relay-carnival-72",
    competitionId: hyogoRelay.id,
    editionNumber: 72,
    year: 2024,
    officialName: "第72回兵庫リレーカーニバル",
    shortName: "第72回兵庫リレーカーニバル",
    startsOn: new Date("2024-04-21"),
    sourceId: jaafHyogoSource.id,
  });
  const hyogoRelay72M3000sc = await upsertRace({
    slug: "hyogo-relay-carnival-72-men-3000msc",
    competitionEditionId: hyogoRelay72.id,
    name: "男子3000mSC",
    discipline: EventDiscipline.m3000sc,
    distanceMeters: 3000,
    startsAt: new Date("2024-04-21"),
    sourceId: jaafHyogoSource.id,
  });

  const osakaMarathon = await upsertCompetition({
    slug: "osaka-marathon",
    nameJa: "大阪マラソン",
    nameRoman: "Osaka Marathon",
    nameZh: "大阪马拉松",
    type: "marathon",
    region: "大阪府",
    websiteUrl: "https://www.osaka-marathon.com/",
  });
  const osakaMarathon2025 = await upsertCompetitionEdition({
    slug: "osaka-marathon-2025",
    competitionId: osakaMarathon.id,
    editionNumber: 13,
    year: 2025,
    officialName: "大阪マラソン2025",
    shortName: "大阪マラソン2025",
    startsOn: new Date("2025-02-24"),
    sourceId: osakaMarathonSource.id,
  });
  const osakaMarathon2025Men = await upsertRace({
    slug: "osaka-marathon-2025-men",
    competitionEditionId: osakaMarathon2025.id,
    name: "男子マラソン",
    discipline: EventDiscipline.marathon,
    distanceMeters: 42195,
    startsAt: new Date("2025-02-24"),
    sourceId: osakaMarathonSource.id,
  });

  const marugameHalf = await upsertCompetition({
    slug: "marugame-half-marathon",
    nameJa: "香川丸亀国際ハーフマラソン",
    nameRoman: "Kagawa Marugame International Half Marathon",
    type: "road_race",
    region: "香川県",
    websiteUrl: "https://www.marugame-half.jp/",
  });
  const marugameHalf77 = await upsertCompetitionEdition({
    slug: "marugame-half-marathon-77",
    competitionId: marugameHalf.id,
    editionNumber: 77,
    year: 2025,
    officialName: "第77回香川丸亀国際ハーフマラソン",
    shortName: "第77回丸亀ハーフ",
    startsOn: new Date("2025-02-02"),
    sourceId: wasedaMarugame2025Source.id,
  });
  const marugameHalf77Men = await upsertRace({
    slug: "marugame-half-marathon-77-men",
    competitionEditionId: marugameHalf77.id,
    name: "男子ハーフマラソン",
    discipline: EventDiscipline.half_marathon,
    distanceMeters: 21097,
    startsAt: new Date("2025-02-02"),
    sourceId: wasedaMarugame2025Source.id,
  });

  const tokyoMarathon = await upsertCompetition({
    slug: "tokyo-marathon",
    nameJa: "東京マラソン",
    nameRoman: "Tokyo Marathon",
    type: "marathon",
    region: "東京都",
    websiteUrl: "https://www.marathon.tokyo/",
  });
  const tokyoMarathon2026 = await upsertCompetitionEdition({
    slug: "tokyo-marathon-2026",
    competitionId: tokyoMarathon.id,
    year: 2026,
    officialName: "東京マラソン2026",
    shortName: "東京マラソン2026",
    startsOn: new Date("2026-03-01"),
    sourceId: wasedaTokyoMarathon2026Source.id,
  });
  const tokyoMarathon2026Men = await upsertRace({
    slug: "tokyo-marathon-2026-men",
    competitionEditionId: tokyoMarathon2026.id,
    name: "男子マラソン",
    discipline: EventDiscipline.marathon,
    distanceMeters: 42195,
    startsAt: new Date("2026-03-01"),
    sourceId: wasedaTokyoMarathon2026Source.id,
  });

  const fisuWorldUniversityGames = await upsertCompetition({
    slug: "fisu-world-university-games",
    nameJa: "FISUワールドユニバーシティゲームズ",
    nameRoman: "FISU World University Games",
    type: "road_race",
    region: "国際",
  });
  const fisuWorldUniversityGames2025 = await upsertCompetitionEdition({
    slug: "fisu-world-university-games-2025",
    competitionId: fisuWorldUniversityGames.id,
    year: 2025,
    officialName: "FISUワールドユニバーシティゲームズ2025",
    shortName: "FISU WUG 2025",
    startsOn: new Date("2025-07-16"),
    sourceId: wasedaFisu2025Source.id,
  });
  const fisu2025HalfMen = await upsertRace({
    slug: "fisu-world-university-games-2025-men-half-marathon",
    competitionEditionId: fisuWorldUniversityGames2025.id,
    name: "男子ハーフマラソン",
    discipline: EventDiscipline.half_marathon,
    distanceMeters: 21097,
    startsAt: new Date("2025-07-24"),
    sourceId: wasedaFisu2025Source.id,
  });

  const kantoIntercollegiate = await upsertCompetition({
    slug: "kanto-intercollegiate",
    nameJa: "関東学生陸上競技対校選手権大会",
    nameRoman: "Kanto Intercollegiate Track & Field Championships",
    type: "track_meet",
    region: "関東",
  });
  const kantoIntercollegiate105 = await upsertCompetitionEdition({
    slug: "kanto-intercollegiate-105",
    competitionId: kantoIntercollegiate.id,
    editionNumber: 105,
    year: 2026,
    officialName: "第105回関東学生陸上競技対校選手権大会",
    shortName: "第105回関東インカレ",
    startsOn: new Date("2026-05-14"),
    sourceId: wasedaKantoIntercollegiate2026Source.id,
  });
  const kantoIntercollegiate105Men5000m = await upsertRace({
    slug: "kanto-intercollegiate-105-men-5000m",
    competitionEditionId: kantoIntercollegiate105.id,
    name: "男子5000m",
    discipline: EventDiscipline.m5000,
    distanceMeters: 5000,
    startsAt: new Date("2026-05-17"),
    sourceId: wasedaKantoIntercollegiate2026Source.id,
  });

  const nittaidaiLongDistance = await upsertCompetition({
    slug: "nittaidai-long-distance-meet",
    nameJa: "日本体育大学長距離競技会",
    nameRoman: "Nittaidai Long Distance Meet",
    type: "track_meet",
    region: "神奈川県",
    websiteUrl: "https://ld.nssu-athletic.com/",
  });
  const nittaidaiLongDistance304 = await upsertCompetitionEdition({
    slug: "nittaidai-long-distance-meet-304",
    competitionId: nittaidaiLongDistance.id,
    editionNumber: 304,
    year: 2023,
    officialName: "第304回日本体育大学長距離競技会",
    shortName: "第304回日体大長距離競技会",
    startsOn: new Date("2023-04-22"),
    sourceId: nittaidai20230422Source.id,
  });
  const nittaidaiLongDistance304Men10000m = await upsertRace({
    slug: "nittaidai-long-distance-meet-304-men-10000m",
    competitionEditionId: nittaidaiLongDistance304.id,
    name: "男子10000m",
    discipline: EventDiscipline.m10000,
    distanceMeters: 10000,
    startsAt: new Date("2023-04-22"),
    sourceId: nittaidai20230422Source.id,
  });

  const universityBySlug = new Map(
    [
      aogaku,
      komazawa,
      kokugakuin,
      waseda,
      chuo,
      josai,
      soka,
      tokyoInternational,
      toyo,
      teikyo,
      chuoGakuin,
      juntendo,
      yamanashiGakuin,
      nihon,
      tokai,
      tokyoNogyo,
      kanagawa,
      daitoBunka,
      nipponSportScience,
      rikkyo,
      hosei,
      senshu,
      kantoStudentUnion,
    ].map((organization) => [organization.slug, organization]),
  );
  const highSchoolBySlug = new Map(
    [
      tamano,
      mikata,
      sendaiIkuei,
      shigaGakuen,
      kochiTechnical,
      yachiyoShoin,
      rakunan,
      tsurugaKehi,
      rifu,
      fujisawaShoryo,
      toyoUshiku,
      abiko,
      kasukabeHigashi,
      chuetsu,
      kyushuGakuin,
      musashiOgose,
      hidaka,
      nishiwakiTechnical,
      soyo,
      matsuyama,
      tomisato,
      mauHigh,
      ichiritsuFunabashi,
      kokugakuinKugayama,
      gakuhoIshikawa,
      tokaiUniversityShoyo,
      kusatsuHigashi,
      hirosakiJitsugyo,
      omuta,
      senshuUniversityKumamoto,
      ngongHigh,
      takudaiKoryo,
      irigitatiHigh,
      silHigh,
      izumiChuo,
      kojokan,
      kurashiki,
      saitamaSakae,
      kentaTakasaki,
      wasedaJitsugyo,
      suijo,
      osakaHigh,
      toyokawa,
      kobayashi,
      kagoshimaJitsugyo,
      sanoNichidai,
      gifuShotoku,
      aichiHigh,
      hiroshimaKokusaiGakuin,
      tokaiUniversityOsakaGyosei,
      kapkatet,
      mikuyuni,
      uedaNishi,
      igaHakuho,
      sakuChosei,
      hokuzan,
      hotokuGakuen,
      koma,
      keisei,
      asahino,
      jiyugaoka,
    ].map((organization) => [organization.slug, organization]),
  );

  const players: SeedPlayer[] = [
    {
      slug: "asahi-kuroda",
      displayNameJa: "黒田 朝日",
      displayNameKana: "くろだ あさひ",
      displayNameRoman: "Asahi Kuroda",
      birthDate: new Date("2004-03-10"),
      hometown: "岡山県",
      nationality: "JPN",
      university: aogaku,
      highSchool: tamano,
      currentTeam: gmo,
      currentTeamSourceId: gmoSource.id,
      grade: 4,
      highSchoolStart: new Date("2019-04-01"),
      highSchoolEnd: new Date("2022-03-31"),
      universityStart: new Date("2022-04-01"),
      universityEnd: new Date("2026-03-31"),
      currentTeamStart: new Date("2026-04-01"),
      profileStatus: DataStatus.verified,
      pbs: [
        {
          discipline: EventDiscipline.m3000sc,
          mark: "8:35.10",
          achievedOn: new Date("2024-04-21"),
          competitionName: "第72回兵庫リレーカーニバル",
          venue: "ユニバー記念競技場",
          sourceId: jaafHyogoSource.id,
        },
        {
          discipline: EventDiscipline.m5000,
          mark: "13:29.56",
          achievedOn: new Date("2024-06-01"),
          competitionName: "日本体育大学長距離競技会",
          venue: "NITTAIDAI Athletic Stadium, Yokohama",
          sourceId: worldAthleticsSource.id,
        },
        {
          discipline: EventDiscipline.m10000,
          mark: "27:37.62",
          achievedOn: new Date("2025-11-22"),
          competitionName: "MARCH対抗戦2025",
          venue: "町田GIONスタジアム",
          sourceId: rikujokyogiMarchSource.id,
          notes: "World Athletics の表示値 27:52.02 より新しい国内記録。GMO/KGRR 第102回エントリーでも同値。",
        },
        {
          discipline: EventDiscipline.half_marathon,
          mark: "1:01:39",
          achievedOn: new Date("2024-02-04"),
          competitionName: "香川丸亀国際ハーフマラソン",
          venue: "Marugame",
          sourceId: worldAthleticsSource.id,
        },
        {
          discipline: EventDiscipline.marathon,
          mark: "2:06:05",
          achievedOn: new Date("2025-02-24"),
          competitionName: "大阪マラソン2025",
          venue: "大阪",
          sourceId: osakaMarathonSource.id,
          notes: "日本学生最高記録。",
        },
      ],
      raceResults: [
        {
          race: hakone100Leg2,
          organization: aogaku,
          mark: "1:06:07",
          rank: 1,
          gradeAtRace: 2,
          notes: "区間賞",
          sourceId: hakoneOfficialSource.id,
        },
        {
          race: hakone101Leg2,
          organization: aogaku,
          mark: "1:05:44",
          rank: 3,
          gradeAtRace: 3,
          notes: "区間新",
          sourceId: hakoneOfficialSource.id,
        },
        {
          race: hakone102Leg5,
          organization: aogaku,
          mark: "1:07:16",
          rank: 1,
          gradeAtRace: 4,
          notes: "区間賞 / 区間新",
          sourceId: hakoneOfficialSource.id,
        },
        {
          race: izumo35Leg2,
          organization: aogaku,
          mark: "16:08",
          rank: 1,
          gradeAtRace: 2,
          notes: "同タイム区間1位",
          sourceId: izumoOfficialSource.id,
        },
        {
          race: march2025M10000Heat4,
          organization: aogaku,
          mark: "27:37.62",
          rank: 1,
          gradeAtRace: 4,
          notes: "全体トップ / 日本人学生歴代8位 / PB",
          sourceId: rikujokyogiMarchSource.id,
        },
        {
          race: hyogoRelay72M3000sc,
          organization: aogaku,
          mark: "8:35.10",
          gradeAtRace: 3,
          notes: "PB",
          sourceId: jaafHyogoSource.id,
        },
        {
          race: osakaMarathon2025Men,
          organization: aogaku,
          mark: "2:06:05",
          rank: 6,
          gradeAtRace: 3,
          notes: "日本学生最高記録 / PB",
          sourceId: osakaMarathonSource.id,
        },
      ],
    },
    {
      slug: "kiyoto-hirabayashi",
      displayNameJa: "平林 清澄",
      displayNameKana: "ひらばやし きよと",
      displayNameRoman: "Kiyoto Hirabayashi",
      birthDate: null,
      hometown: null,
      nationality: null,
      university: kokugakuin,
      highSchool: mikata,
      currentTeam: null,
      grade: 4,
      highSchoolStart: new Date("2019-04-01"),
      highSchoolEnd: new Date("2022-03-31"),
      universityStart: new Date("2022-04-01"),
      universityEnd: new Date("2026-03-31"),
      currentTeamStart: null,
      pbs: [
        { discipline: EventDiscipline.m5000, mark: "13:55.30", sourceId: source.id },
        { discipline: EventDiscipline.m10000, mark: "27:55.15", sourceId: source.id },
        { discipline: EventDiscipline.half_marathon, mark: "1:01:23", sourceId: source.id },
      ],
      hakoneRace: hakone101Leg2,
      hakoneMark: null,
      hakoneRank: null,
      hakoneNotes: null,
    },
    {
      slug: "kudo-shinsaku",
      displayNameJa: "工藤 慎作",
      displayNameKana: "くどう しんさく",
      displayNameRoman: "Shinsaku Kudo",
      birthDate: new Date("2004-11-10"),
      hometown: "千葉県",
      nationality: null,
      university: waseda,
      highSchool: yachiyoShoin,
      currentTeam: null,
      grade: 4,
      highSchoolStart: new Date("2020-04-01"),
      highSchoolEnd: new Date("2023-03-31"),
      universityStart: new Date("2023-04-01"),
      universityEnd: new Date("2027-03-31"),
      currentTeamStart: null,
      faculty: "スポーツ科学",
      pbs: [
        { discipline: EventDiscipline.m1500, mark: "3:55.08", sourceId: wasedaKudoSource.id },
        {
          discipline: EventDiscipline.m5000,
          mark: "13:38.67",
          achievedOn: new Date("2026-05-17"),
          competitionName: "第105回関東学生陸上競技対校選手権大会",
          venue: "相模原ギオンスタジアム",
          sourceId: wasedaKantoIntercollegiate2026Source.id,
        },
        {
          discipline: EventDiscipline.m10000,
          mark: "28:31.87",
          achievedOn: new Date("2023-04-22"),
          competitionName: "第304回日本体育大学長距離競技会",
          venue: "日本体育大学健志台キャンパス陸上競技場",
          sourceId: nittaidai20230422Source.id,
        },
        {
          discipline: EventDiscipline.half_marathon,
          mark: "1:00:06",
          achievedOn: new Date("2025-02-02"),
          competitionName: "第77回香川丸亀国際ハーフマラソン",
          venue: "香川県丸亀市",
          sourceId: wasedaMarugame2025Source.id,
          notes: "早稲田新記録。",
        },
        {
          discipline: EventDiscipline.marathon,
          mark: "2:07:34",
          achievedOn: new Date("2026-03-01"),
          competitionName: "東京マラソン2026",
          venue: "東京",
          sourceId: wasedaTokyoMarathon2026Source.id,
          notes: "早稲田新記録。",
        },
      ],
      raceResults: [
        {
          race: nittaidaiLongDistance304Men10000m,
          organization: waseda,
          mark: "28:31.87",
          rank: null,
          gradeAtRace: 1,
          notes: "PB",
          sourceId: nittaidai20230422Source.id,
        },
        {
          race: hakone100Leg5,
          organization: waseda,
          mark: "1:12:12",
          rank: 6,
          gradeAtRace: 1,
          sourceId: hakoneOfficialKudoSource.id,
        },
        {
          race: allJapanUniversityEkiden55Leg4,
          organization: waseda,
          mark: "35:36",
          rank: 13,
          gradeAtRace: 1,
          sourceId: allJapanEkiden55Source.id,
        },
        {
          race: hakone101Leg5,
          organization: waseda,
          mark: "1:09:31",
          rank: 2,
          gradeAtRace: 2,
          sourceId: hakoneOfficialKudoSource.id,
        },
        {
          race: allJapanUniversityEkiden56Leg8,
          organization: waseda,
          mark: "58:12",
          rank: 3,
          gradeAtRace: 2,
          sourceId: allJapanEkiden56Source.id,
        },
        {
          race: hakone102Leg5,
          organization: waseda,
          mark: "1:09:46",
          rank: 3,
          gradeAtRace: 3,
          sourceId: hakoneOfficialKudoSource.id,
        },
        {
          race: marugameHalf77Men,
          organization: waseda,
          mark: "1:00:06",
          rank: 5,
          gradeAtRace: 2,
          notes: "日本学生選手権1位 / 早稲田新記録 / PB",
          sourceId: wasedaMarugame2025Source.id,
        },
        {
          race: fisu2025HalfMen,
          organization: waseda,
          mark: "1:02:29",
          rank: 1,
          gradeAtRace: 3,
          notes: "大会新記録",
          sourceId: wasedaFisu2025Source.id,
        },
        {
          race: izumo36Leg6,
          organization: waseda,
          mark: "29:35",
          rank: 2,
          gradeAtRace: 2,
          sourceId: izumoOfficial36Leg6Source.id,
        },
        {
          race: izumo37Leg6,
          organization: waseda,
          mark: "29:48",
          rank: 3,
          gradeAtRace: 3,
          sourceId: izumoOfficial37Leg6Source.id,
        },
        {
          race: allJapanUniversityEkiden57Leg8,
          organization: waseda,
          mark: "56:54",
          rank: 1,
          gradeAtRace: 3,
          notes: "区間賞",
          sourceId: allJapanEkiden57Source.id,
        },
        {
          race: tokyoMarathon2026Men,
          organization: waseda,
          mark: "2:07:34",
          rank: null,
          gradeAtRace: 3,
          notes: "日本人5位 / 早稲田新記録 / PB",
          sourceId: wasedaTokyoMarathon2026Source.id,
        },
        {
          race: kantoIntercollegiate105Men5000m,
          organization: waseda,
          mark: "13:38.67",
          rank: 5,
          gradeAtRace: 4,
          notes: "PB",
          sourceId: wasedaKantoIntercollegiate2026Source.id,
        },
      ],
    },
    {
      slug: "shunkyo-yoshii",
      displayNameJa: "吉居 駿恭",
      displayNameKana: "よしい しゅんきょう",
      displayNameRoman: "Shunkyo Yoshii",
      birthDate: null,
      hometown: null,
      nationality: null,
      university: chuo,
      highSchool: sendaiIkuei,
      currentTeam: null,
      grade: 4,
      highSchoolStart: new Date("2019-04-01"),
      highSchoolEnd: new Date("2022-03-31"),
      universityStart: new Date("2022-04-01"),
      universityEnd: new Date("2026-03-31"),
      currentTeamStart: null,
      pbs: [
        { discipline: EventDiscipline.m5000, mark: "13:22.01", sourceId: source.id },
        { discipline: EventDiscipline.m10000, mark: "28:06.27", sourceId: source.id },
        { discipline: EventDiscipline.half_marathon, mark: "1:02:27", sourceId: source.id },
      ],
      hakoneRace: hakone101Leg1,
      hakoneMark: null,
      hakoneRank: null,
      hakoneNotes: null,
    },
  ];

  const hakone102Leg5Entries = [
    { slug: "asahi-kuroda", displayNameJa: "黒田 朝日", displayNameRoman: "Asahi Kuroda", universitySlug: "aoyama-gakuin-university", highSchoolSlug: "tamano-konan-high-school", grade: 4, mark: "1:07:16", rank: 1, notes: "区間賞 / 区間新", pbs: [{ discipline: EventDiscipline.m5000, mark: "13:29.56" }, { discipline: EventDiscipline.m10000, mark: "27:37.62" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:39" }] },
    { slug: "yasuhara-kaisei", displayNameJa: "安原 海晴", displayNameRoman: "Kaisei Yasuhara", universitySlug: "komazawa-university", highSchoolSlug: "shiga-gakuen-high-school", grade: 3, mark: "1:11:38", rank: 7, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:52.85" }, { discipline: EventDiscipline.m10000, mark: "28:45.66" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:08" }] },
    { slug: "takaishi-itsuki", displayNameJa: "髙石 樹", displayNameRoman: "Itsuki Takaishi", universitySlug: "kokugakuin-university", highSchoolSlug: "kochi-technical-high-school", grade: 1, mark: "1:10:05", rank: 4, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:58.23" }, { discipline: EventDiscipline.m10000, mark: "28:57.49" }] },
    { slug: "kudo-shinsaku", displayNameJa: "工藤 慎作", displayNameRoman: "Shinsaku Kudo", universitySlug: "waseda-university", highSchoolSlug: "yachiyo-shoin-high-school", grade: 3, mark: "1:09:46", rank: 3, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:54.36" }, { discipline: EventDiscipline.m10000, mark: "28:31.87" }, { discipline: EventDiscipline.half_marathon, mark: "1:00:06" }] },
    { slug: "shibata-daichi", displayNameJa: "柴田 大地", displayNameRoman: "Daichi Shibata", universitySlug: "chuo-university", highSchoolSlug: "rakunan-high-school", grade: 3, mark: "1:12:16", rank: 11, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:43.77" }, { discipline: EventDiscipline.m10000, mark: "28:47.65" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:41" }] },
    { slug: "saito-shoya", displayNameJa: "斎藤 将也", displayNameRoman: "Shoya Saito", universitySlug: "josai-university", highSchoolSlug: "tsuruga-kehi-high-school", grade: 4, mark: "1:09:28", rank: 2, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:33.39" }, { discipline: EventDiscipline.m10000, mark: "27:45.12" }, { discipline: EventDiscipline.half_marathon, mark: "1:03:18" }] },
    { slug: "nozawa-yuma", displayNameJa: "野沢 悠真", displayNameRoman: "Yuma Nozawa", universitySlug: "soka-university", highSchoolSlug: "rifu-high-school", grade: 4, mark: "1:11:31", rank: 6, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:11.91" }, { discipline: EventDiscipline.m10000, mark: "28:47.63" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:46" }] },
    { slug: "aratani-shunsuke", displayNameJa: "荒谷 俊輔", displayNameRoman: "Shunsuke Aratani", universitySlug: "tokyo-international-university", highSchoolSlug: "fujisawa-shoryo-high-school", grade: 1, mark: "1:16:10", rank: 20, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:24.34" }, { discipline: EventDiscipline.m10000, mark: "31:26.81" }, { discipline: EventDiscipline.half_marathon, mark: "1:04:51" }] },
    { slug: "miyazaki-yu", displayNameJa: "宮崎 優", displayNameRoman: "Yu Miyazaki", universitySlug: "toyo-university", highSchoolSlug: "toyo-university-ushiku-high-school", grade: 2, mark: "1:13:38", rank: 15, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:56.76" }, { discipline: EventDiscipline.m10000, mark: "28:59.66" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:49" }] },
    { slug: "asakawa-yuta", displayNameJa: "浅川 侑大", displayNameRoman: "Yuta Asakawa", universitySlug: "teikyo-university", highSchoolSlug: "rakunan-high-school", grade: 3, mark: "1:11:51", rank: 8, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:08.42" }, { discipline: EventDiscipline.m10000, mark: "28:46.73" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:59" }] },
    { slug: "yoneda-kota", displayNameJa: "米田 昂太", displayNameRoman: "Kota Yoneda", universitySlug: "chuo-gakuin-university", highSchoolSlug: "abiko-high-school", grade: 2, mark: "1:12:29", rank: 12, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:22.83" }, { discipline: EventDiscipline.m10000, mark: "28:40.18" }] },
    { slug: "kobayashi-yuto", displayNameJa: "小林 侑世", displayNameRoman: "Yuto Kobayashi", universitySlug: "juntendo-university", highSchoolSlug: "kasukabe-higashi-high-school", grade: 3, mark: "1:10:31", rank: 5, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:18.39" }, { discipline: EventDiscipline.m10000, mark: "28:57.33" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:46" }] },
    { slug: "yuge-masayoshi", displayNameJa: "弓削 征慶", displayNameRoman: "Masayoshi Yuge", universitySlug: "yamanashi-gakuin-university", highSchoolSlug: "rakunan-high-school", grade: 4, mark: "1:12:00", rank: 10, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:42.39" }, { discipline: EventDiscipline.m10000, mark: "30:04.02" }, { discipline: EventDiscipline.half_marathon, mark: "1:04:47" }] },
    { slug: "suzuki-koji", displayNameJa: "鈴木 孔士", displayNameRoman: "Koji Suzuki", universitySlug: "nihon-university", highSchoolSlug: "chuetsu-high-school", grade: 4, mark: "1:11:59", rank: 9, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:32.88" }, { discipline: EventDiscipline.m10000, mark: "28:45.60" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:52" }] },
    { slug: "nagamoto-shu", displayNameJa: "永本 脩", displayNameRoman: "Shu Nagamoto", universitySlug: "tokai-university", highSchoolSlug: "kyushu-gakuin-high-school", grade: 3, mark: "1:12:39", rank: 13, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:49.58" }, { discipline: EventDiscipline.m10000, mark: "28:44.15" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:23" }] },
    { slug: "kojima-gakuto", displayNameJa: "小島 岳斗", displayNameRoman: "Gakuto Kojima", universitySlug: "tokyo-university-of-agriculture", highSchoolSlug: "musashi-ogose-high-school", grade: 4, mark: "1:15:12", rank: 19, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:07.68" }, { discipline: EventDiscipline.m10000, mark: "29:02.64" }, { discipline: EventDiscipline.half_marathon, mark: "1:03:01" }] },
    { slug: "mihara-ryoga", displayNameJa: "三原 涼雅", displayNameRoman: "Ryoga Mihara", universitySlug: "kanagawa-university", highSchoolSlug: "hidaka-high-school", grade: 3, mark: "1:14:22", rank: 16, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:23.27" }, { discipline: EventDiscipline.m10000, mark: "28:53.12" }, { discipline: EventDiscipline.half_marathon, mark: "1:03:24" }] },
    { slug: "ueda-shodai", displayNameJa: "上田 翔大", displayNameRoman: "Shodai Ueda", universitySlug: "daito-bunka-university", highSchoolSlug: "nishiwaki-technical-high-school", grade: 1, mark: "1:13:29", rank: 14, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:08.55" }, { discipline: EventDiscipline.m10000, mark: "32:54.88" }, { discipline: EventDiscipline.half_marathon, mark: "1:04:03" }] },
    { slug: "uragami-kazuki", displayNameJa: "浦上 和樹", displayNameRoman: "Kazuki Uragami", universitySlug: "nippon-sport-science-university", highSchoolSlug: "kyushu-gakuin-high-school", grade: 4, mark: "1:14:38", rank: 18, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:16.87" }, { discipline: EventDiscipline.m10000, mark: "29:05.97" }, { discipline: EventDiscipline.half_marathon, mark: "1:03:21" }] },
    { slug: "kijima-riku", displayNameJa: "木島 陸", displayNameRoman: "Riku Kijima", universitySlug: "rikkyo-university", highSchoolSlug: "soyo-high-school", grade: 3, mark: "1:14:30", rank: 17, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:18.66" }, { discipline: EventDiscipline.m10000, mark: "29:12.71" }, { discipline: EventDiscipline.half_marathon, mark: "1:03:42" }] },
    { slug: "takahashi-ayumu", displayNameJa: "髙橋 歩夢", displayNameRoman: "Ayumu Takahashi", universitySlug: "kanto-student-union", highSchoolSlug: "matsuyama-high-school", grade: 3, mark: "1:16:39", rank: null, notes: "OP", pbs: [{ discipline: EventDiscipline.m5000, mark: "14:16.99" }, { discipline: EventDiscipline.m10000, mark: "29:26.67" }, { discipline: EventDiscipline.half_marathon, mark: "1:03:19" }] },
  ];
  const hakone102Leg1Entries = [
    { slug: "hikaru-ogawara", displayNameJa: "小河原 陽琉", displayNameRoman: "Ogawara Hikaru", universitySlug: "aoyama-gakuin-university", highSchoolSlug: "yachiyo-shoin-high-school", grade: 2, mark: "1:01:47", rank: 16, notes: null, pbs: [] },
    { slug: "shoya-koyama", displayNameJa: "小山 翔也", displayNameRoman: "Koyama Shoya", universitySlug: "komazawa-university", highSchoolSlug: "saitama-sakae-high-school", grade: 3, mark: "1:00:48", rank: 5, notes: null, pbs: [] },
    { slug: "rui-aoki", displayNameJa: "青木 瑠郁", displayNameRoman: "Aoki Rui", universitySlug: "kokugakuin-university", highSchoolSlug: "kenta-takasaki-high-school", grade: 4, mark: "1:00:28", rank: 1, notes: null, pbs: [] },
    { slug: "nayabnaoki-yoshikura", displayNameJa: "吉倉 ナヤブ直希", displayNameRoman: "Yoshikura Nayabnaoki", universitySlug: "waseda-university", highSchoolSlug: "waseda-jitsugyo-high-school", grade: 2, mark: "1:00:58", rank: 7, notes: null, pbs: [] },
    { slug: "daichi-fujita", displayNameJa: "藤田 大智", displayNameRoman: "Fujita Daichi", universitySlug: "chuo-university", highSchoolSlug: "nishiwaki-technical-high-school", grade: 3, mark: "1:00:37", rank: 2, notes: null, pbs: [] },
    { slug: "yu-shibata", displayNameJa: "柴田 侑", displayNameRoman: "Shibata Yu", universitySlug: "josai-university", highSchoolSlug: "shiga-gakuen-high-school", grade: 3, mark: "1:00:51", rank: 6, notes: null, pbs: [] },
    { slug: "hinata-kuroki", displayNameJa: "黒木 陽向", displayNameRoman: "Kuroki Hinata", universitySlug: "soka-university", highSchoolSlug: "kyushu-gakuin-high-school", grade: 4, mark: "1:01:43", rank: 14, notes: null, pbs: [] },
    { slug: "yujiro-koshiba", displayNameJa: "小柴 裕士郎", displayNameRoman: "Koshiba Yujiro", universitySlug: "tokyo-international-university", highSchoolSlug: "suijo-high-school", grade: 2, mark: "1:03:02", rank: 18, notes: null, pbs: [] },
    { slug: "kaito-matsui", displayNameJa: "松井 海斗", displayNameRoman: "Matsui Kaito", universitySlug: "toyo-university", highSchoolSlug: "saitama-sakae-high-school", grade: 2, mark: "1:00:43", rank: 3, notes: null, pbs: [] },
    { slug: "yudai-hara", displayNameJa: "原 悠太", displayNameRoman: "Hara Yudai", universitySlug: "teikyo-university", highSchoolSlug: "osaka-high-school", grade: 3, mark: "1:03:09", rank: 19, notes: null, pbs: [] },
    { slug: "hiro-konda", displayNameJa: "近田 陽路", displayNameRoman: "Konda Hiro", universitySlug: "chuo-gakuin-university", highSchoolSlug: "toyokawa-high-school", grade: 4, mark: "1:00:45", rank: 4, notes: null, pbs: [] },
    { slug: "riito-ikema", displayNameJa: "池間 凛斗", displayNameRoman: "Ikema Riito", universitySlug: "juntendo-university", highSchoolSlug: "kobayashi-high-school", grade: 2, mark: "1:01:20", rank: 9, notes: null, pbs: [] },
    { slug: "mitsuki-hirayae", displayNameJa: "平八重 充希", displayNameRoman: "Hirayae Mitsuki", universitySlug: "yamanashi-gakuin-university", highSchoolSlug: "kagoshima-jitsugyo-high-school", grade: 4, mark: "1:01:33", rank: 12, notes: null, pbs: [] },
    { slug: "shota-yamaguchi", displayNameJa: "山口 彰太", displayNameRoman: "Yamaguchi Shota", universitySlug: "nihon-university", highSchoolSlug: "sano-nichidai-high-school", grade: 3, mark: "1:02:08", rank: 17, notes: null, pbs: [] },
    { slug: "juda-hyodo", displayNameJa: "兵藤 ジュダ", displayNameRoman: "Hyodo Juda", universitySlug: "tokai-university", highSchoolSlug: "tokai-university-shoyo-high-school", grade: 4, mark: "1:01:41", rank: 13, notes: null, pbs: [] },
    { slug: "koki-kurimoto", displayNameJa: "栗本 航希", displayNameRoman: "Kurimoto Koki", universitySlug: "tokyo-university-of-agriculture", highSchoolSlug: "gifu-shotoku-high-school", grade: 3, mark: "1:01:21", rank: 10, notes: null, pbs: [] },
    { slug: "kensei-sakai", displayNameJa: "酒井 健成", displayNameRoman: "Sakai Kensei", universitySlug: "kanagawa-university", highSchoolSlug: "aichi-high-school", grade: 4, mark: "1:01:21", rank: 11, notes: null, pbs: [] },
    { slug: "takuma-ohama", displayNameJa: "大濱 逞真", displayNameRoman: "Ohama Takuma", universitySlug: "daito-bunka-university", highSchoolSlug: "sendai-ikuei-high-school", grade: 2, mark: "1:01:46", rank: 15, notes: null, pbs: [] },
    { slug: "ryuto-hirashima", displayNameJa: "平島 龍斗", displayNameRoman: "Hirashima Ryuto", universitySlug: "nippon-sport-science-university", highSchoolSlug: "soyo-high-school", grade: 4, mark: "1:01:01", rank: 8, notes: null, pbs: [] },
    { slug: "yusei-yoshiya", displayNameJa: "吉屋 佑晟", displayNameRoman: "Yoshiya Yusei", universitySlug: "rikkyo-university", highSchoolSlug: "hiroshima-kokusai-gakuin-high-school", grade: 4, mark: "1:03:27", rank: 20, notes: null, pbs: [] },
    { slug: "so-kawasaki", displayNameJa: "川﨑 颯", displayNameRoman: "Kawasaki So", universitySlug: "kanto-student-union", highSchoolSlug: "tokai-university-osaka-gyosei-high-school", grade: 3, mark: "1:00:38", rank: null, notes: "OP", pbs: [] },
  ];
  const hakone102Leg2Entries = [
    { slug: "kaito-iida", displayNameJa: "飯田 翔大", displayNameRoman: "Iida Kaito", universitySlug: "aoyama-gakuin-university", highSchoolSlug: "izumi-chuo-high-school", grade: 2, mark: "1:06:29", rank: 10, notes: null, pbs: [] },
    { slug: "shunsuke-kuwata", displayNameJa: "桑田 駿介", displayNameRoman: "Kuwata Shunsuke", universitySlug: "komazawa-university", highSchoolSlug: "kurashiki-high-school", grade: 2, mark: "1:06:19", rank: 8, notes: null, pbs: [] },
    { slug: "ryuto-uehara", displayNameJa: "上原 琉翔", displayNameRoman: "Uehara Ryuto", universitySlug: "kokugakuin-university", highSchoolSlug: "hokuzan-high-school", grade: 4, mark: "1:07:08", rank: 12, notes: null, pbs: [] },
    { slug: "yamaguchi-tomonori", displayNameJa: "山口 智規", displayNameRoman: "Yamaguchi Tomonori", universitySlug: "waseda-university", highSchoolSlug: "gakuho-ishikawa-high-school", grade: 4, mark: "1:05:47", rank: 4, notes: null, pbs: [] },
    { slug: "tameike-itta", displayNameJa: "溜池 一太", displayNameRoman: "Tameike Itta", universitySlug: "chuo-university", highSchoolSlug: "rakunan-high-school", grade: 4, mark: "1:06:06", rank: 6, notes: null, pbs: [] },
    { slug: "victor-kimutai", displayNameJa: "Ｖ.キムタイ", displayNameRoman: "Victor Kimutai", universitySlug: "josai-university", highSchoolSlug: "mau-high-school", grade: 4, mark: "1:05:09", rank: 1, notes: null, pbs: [] },
    { slug: "stephen-muthini", displayNameJa: "Ｓ.ムチーニ", displayNameRoman: "Stephen Muthini", universitySlug: "soka-university", highSchoolSlug: "mikuyuni-high-school", grade: 3, mark: "1:06:00", rank: 5, notes: null, pbs: [] },
    { slug: "richard-etir", displayNameJa: "Ｒ.エティーリ", displayNameRoman: "Richard Etir", universitySlug: "tokyo-international-university", highSchoolSlug: "sil-high-school", grade: 3, mark: "1:06:14", rank: 7, notes: null, pbs: [] },
    { slug: "mashu-nishimura", displayNameJa: "西村 真周", displayNameRoman: "Nishimura Mashu", universitySlug: "toyo-university", highSchoolSlug: "jiyugaoka-high-school", grade: 4, mark: "1:10:24", rank: 19, notes: null, pbs: [] },
    { slug: "yoshihiro-kusuoka", displayNameJa: "楠岡 由浩", displayNameRoman: "Kusuoka Yoshihiro", universitySlug: "teikyo-university", highSchoolSlug: "keisei-high-school", grade: 3, mark: "1:11:50", rank: 20, notes: null, pbs: [] },
    { slug: "taisei-ichikawa", displayNameJa: "市川 大世", displayNameRoman: "Ichikawa Taisei", universitySlug: "chuo-gakuin-university", highSchoolSlug: "koma-high-school", grade: 3, mark: "1:07:42", rank: 15, notes: null, pbs: [] },
    { slug: "hiroto-yoshioka", displayNameJa: "吉岡 大翔", displayNameRoman: "Yoshioka Hiroto", universitySlug: "juntendo-university", highSchoolSlug: "saku-chosei-high-school", grade: 3, mark: "1:06:28", rank: 9, notes: null, pbs: [] },
    { slug: "brian-kipyegon", displayNameJa: "Ｂ.キピエゴ", displayNameRoman: "Brian Kipyegon", universitySlug: "yamanashi-gakuin-university", highSchoolSlug: "kapkatet-high-school", grade: 3, mark: "1:05:43", rank: 3, notes: null, pbs: [] },
    { slug: "shadrack-kipkemei", displayNameJa: "Ｓ.キップケメイ", displayNameRoman: "Shadrack Kipkemei", universitySlug: "nihon-university", highSchoolSlug: "irigitati-high-school", grade: 3, mark: "1:05:42", rank: 2, notes: null, pbs: [] },
    { slug: "hisaya-hanaoka", displayNameJa: "花岡 寿哉", displayNameRoman: "Hanaoka Hisaya", universitySlug: "tokai-university", highSchoolSlug: "ueda-nishi-high-school", grade: 4, mark: "1:08:00", rank: 16, notes: null, pbs: [] },
    { slug: "kazuma-maeda", displayNameJa: "前田 和摩", displayNameRoman: "Maeda Kazuma", universitySlug: "tokyo-university-of-agriculture", highSchoolSlug: "hotoku-gakuen-high-school", grade: 3, mark: "1:06:31", rank: 11, notes: null, pbs: [] },
    { slug: "haruto-miyamoto", displayNameJa: "宮本 陽叶", displayNameRoman: "Miyamoto Haruto", universitySlug: "kanagawa-university", highSchoolSlug: "rakunan-high-school", grade: 4, mark: "1:07:26", rank: 13, notes: null, pbs: [] },
    { slug: "kazura-munakata", displayNameJa: "棟方 一楽", displayNameRoman: "Munakata Kazura", universitySlug: "daito-bunka-university", highSchoolSlug: "hirosaki-jitsugyo-high-school", grade: 3, mark: "1:09:29", rank: 17, notes: null, pbs: [] },
    { slug: "shunsuke-tajima", displayNameJa: "田島 駿介", displayNameRoman: "Tajima Shunsuke", universitySlug: "nippon-sport-science-university", highSchoolSlug: "asahino-high-school", grade: 4, mark: "1:07:41", rank: 14, notes: null, pbs: [] },
    { slug: "kento-baba", displayNameJa: "馬場 賢人", displayNameRoman: "Baba Kento", universitySlug: "rikkyo-university", highSchoolSlug: "omuta-high-school", grade: 4, mark: "1:09:54", rank: 18, notes: null, pbs: [] },
    { slug: "kio-furuhashi", displayNameJa: "古橋 希翁", displayNameRoman: "Furuhashi Kio", universitySlug: "kanto-student-union", highSchoolSlug: "iga-hakuho-high-school", grade: 3, mark: "1:07:59", rank: null, notes: "OP", pbs: [] },
  ];
  const hakone101Leg2Entries = [
    { slug: "asahi-kuroda", displayNameJa: "黒田 朝日", displayNameRoman: "Asahi Kuroda", universitySlug: "aoyama-gakuin-university", highSchoolSlug: "tamano-konan-high-school", grade: 3, mark: "1:05:44", rank: 3, notes: "区間新", pbs: [{ discipline: EventDiscipline.m5000, mark: "13:29.56" }, { discipline: EventDiscipline.m10000, mark: "27:49.60" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:39" }] },
    { slug: "shinohara-kotaro", displayNameJa: "篠原 倖太朗", displayNameRoman: "Kotaro Shinohara", universitySlug: "komazawa-university", highSchoolSlug: "tomisato-high-school", grade: 4, mark: "1:06:14", rank: 4, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:15.70" }, { discipline: EventDiscipline.m10000, mark: "27:35.05" }, { discipline: EventDiscipline.half_marathon, mark: "1:00:11" }] },
    { slug: "victor-kimutai", displayNameJa: "Ｖ.キムタイ", displayNameRoman: "Victor Kimutai", universitySlug: "josai-university", highSchoolSlug: "mau-high-school", grade: 3, mark: "1:06:55", rank: 10, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:23.60" }, { discipline: EventDiscipline.m10000, mark: "27:41.04" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:21" }] },
    { slug: "ogata-renato", displayNameJa: "緒方 澪那斗", displayNameRoman: "Renato Ogata", universitySlug: "toyo-university", highSchoolSlug: "ichiritsu-funabashi-high-school", grade: 3, mark: "1:08:50", rank: 20, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:54.45" }, { discipline: EventDiscipline.m10000, mark: "28:36.67" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:42" }] },
    { slug: "kiyoto-hirabayashi", displayNameJa: "平林 清澄", displayNameRoman: "Kiyoto Hirabayashi", universitySlug: "kokugakuin-university", highSchoolSlug: "mikata-high-school", grade: 4, mark: "1:06:38", rank: 8, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:55.30" }, { discipline: EventDiscipline.m10000, mark: "27:55.15" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:23" }] },
    { slug: "koizumi-itsuki", displayNameJa: "小泉 樹", displayNameRoman: "Itsuki Koizumi", universitySlug: "hosei-university", highSchoolSlug: "kokugakuin-kugayama-high-school", grade: 4, mark: "1:07:57", rank: 15, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:53.82" }, { discipline: EventDiscipline.m10000, mark: "28:50.64" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:13" }] },
    { slug: "yamaguchi-tomonori", displayNameJa: "山口 智規", displayNameRoman: "Tomonori Yamaguchi", universitySlug: "waseda-university", highSchoolSlug: "gakuho-ishikawa-high-school", grade: 3, mark: "1:07:01", rank: 12, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:30.19" }, { discipline: EventDiscipline.m10000, mark: "27:52.37" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:16" }] },
    { slug: "yoshida-hibiki", displayNameJa: "吉田 響", displayNameRoman: "Hibiki Yoshida", universitySlug: "soka-university", highSchoolSlug: "tokai-university-shoyo-high-school", grade: 4, mark: "1:05:43", rank: 2, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:39.94" }, { discipline: EventDiscipline.m10000, mark: "28:12.01" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:45" }] },
    { slug: "yamanaka-hiroki", displayNameJa: "山中 博生", displayNameRoman: "Hiroki Yamanaka", universitySlug: "teikyo-university", highSchoolSlug: "kusatsu-higashi-high-school", grade: 4, mark: "1:06:22", rank: 5, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:25.26" }, { discipline: EventDiscipline.m10000, mark: "28:04.54" }, { discipline: EventDiscipline.half_marathon, mark: "1:03:02" }] },
    { slug: "munakata-kazura", displayNameJa: "棟方 一楽", displayNameRoman: "Kazura Munakata", universitySlug: "daito-bunka-university", highSchoolSlug: "hirosaki-jitsugyo-high-school", grade: 2, mark: "1:08:29", rank: 17, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:11.09" }, { discipline: EventDiscipline.m10000, mark: "28:32.36" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:38" }] },
    { slug: "baba-kento", displayNameJa: "馬場 賢人", displayNameRoman: "Kento Baba", universitySlug: "rikkyo-university", highSchoolSlug: "omuta-high-school", grade: 3, mark: "1:06:32", rank: 7, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:57.65" }, { discipline: EventDiscipline.m10000, mark: "28:40.67" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:35" }] },
    { slug: "dankan-maina", displayNameJa: "Ｄ.マイナ", displayNameRoman: "Dankan Maina", universitySlug: "senshu-university", highSchoolSlug: "senshu-university-kumamoto-high-school", grade: 1, mark: "1:07:29", rank: 13, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:31.54" }, { discipline: EventDiscipline.m10000, mark: "28:24.61" }, { discipline: EventDiscipline.half_marathon, mark: "1:01:47" }] },
    { slug: "james-mutuku", displayNameJa: "Ｊ.ムトゥク", displayNameRoman: "James Mutuku", universitySlug: "yamanashi-gakuin-university", highSchoolSlug: "ngong-high-school", grade: 3, mark: "1:06:55", rank: 10, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:18.18" }, { discipline: EventDiscipline.m10000, mark: "27:23.09" }, { discipline: EventDiscipline.half_marathon, mark: "1:00:46" }] },
    { slug: "yamazaki-tasuku", displayNameJa: "山崎 丞", displayNameRoman: "Tasuku Yamazaki", universitySlug: "nippon-sport-science-university", highSchoolSlug: "chuetsu-high-school", grade: 3, mark: "1:08:44", rank: 19, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:52.09" }, { discipline: EventDiscipline.m10000, mark: "28:19.33" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:06" }] },
    { slug: "yoshida-reishi", displayNameJa: "吉田 礼志", displayNameRoman: "Reishi Yoshida", universitySlug: "chuo-gakuin-university", highSchoolSlug: "takudai-koryo-high-school", grade: 4, mark: "1:06:24", rank: 6, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:30.30" }, { discipline: EventDiscipline.m10000, mark: "27:47.01" }, { discipline: EventDiscipline.half_marathon, mark: "1:00:31" }] },
    { slug: "tameike-itta", displayNameJa: "溜池 一太", displayNameRoman: "Itta Tameike", universitySlug: "chuo-university", highSchoolSlug: "rakunan-high-school", grade: 3, mark: "1:06:39", rank: 9, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:28.29" }, { discipline: EventDiscipline.m10000, mark: "27:52.38" }, { discipline: EventDiscipline.half_marathon, mark: "1:03:18" }] },
    { slug: "shadrack-kipkemei", displayNameJa: "Ｓ.キップケメイ", displayNameRoman: "Shadrack Kipkemei", universitySlug: "nihon-university", highSchoolSlug: "irigitati-high-school", grade: 2, mark: "1:07:31", rank: 14, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:20.86" }, { discipline: EventDiscipline.m10000, mark: "27:20.05" }, { discipline: EventDiscipline.half_marathon, mark: "1:00:16" }] },
    { slug: "richard-etir", displayNameJa: "Ｒ.エティーリ", displayNameRoman: "Richard Etir", universitySlug: "tokyo-international-university", highSchoolSlug: "sil-high-school", grade: 2, mark: "1:05:31", rank: 1, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:00.17" }, { discipline: EventDiscipline.m10000, mark: "27:06.88" }, { discipline: EventDiscipline.half_marathon, mark: "0:59:32" }] },
    { slug: "miyamoto-haruto", displayNameJa: "宮本 陽叶", displayNameRoman: "Haruto Miyamoto", universitySlug: "kanagawa-university", highSchoolSlug: "rakunan-high-school", grade: 3, mark: "1:08:29", rank: 17, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "14:06.75" }, { discipline: EventDiscipline.m10000, mark: "28:33.32" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:14" }] },
    { slug: "tamame-riku", displayNameJa: "玉目 陸", displayNameRoman: "Riku Tamame", universitySlug: "juntendo-university", highSchoolSlug: "izumi-chuo-high-school", grade: 1, mark: "1:08:22", rank: 16, notes: null, pbs: [{ discipline: EventDiscipline.m5000, mark: "13:57.45" }, { discipline: EventDiscipline.m10000, mark: "28:13.67" }] },
    { slug: "morikawa-sota", displayNameJa: "森川 蒼太", displayNameRoman: "Sota Morikawa", universitySlug: "kanto-student-union", highSchoolSlug: "kojokan-high-school", grade: 4, mark: "1:08:58", rank: null, notes: "OP", pbs: [{ discipline: EventDiscipline.m5000, mark: "14:05.25" }, { discipline: EventDiscipline.m10000, mark: "28:37.79" }, { discipline: EventDiscipline.half_marathon, mark: "1:02:14" }] },
  ];
  const protectedProfileSlugs = new Set(["asahi-kuroda", "kudo-shinsaku", "kiyoto-hirabayashi"]);
  const verifiedHakoneSourceBySlug = new Map([
    ["asahi-kuroda", hakoneOfficialSource.id],
    ["kudo-shinsaku", hakoneOfficialKudoSource.id],
  ]);

  for (const player of players) {
    const person = await upsertSeedPerson({
      slug: player.slug,
      displayNameJa: player.displayNameJa,
      displayNameKana: player.displayNameKana,
      displayNameRoman: player.displayNameRoman,
      birthDate: player.birthDate,
      hometown: player.hometown,
      nationality: player.nationality,
      status: player.profileStatus ?? DataStatus.pending,
    });

    await ensureSeedMembership({
      personId: person.id,
      organizationId: player.university.id,
      type: MembershipType.enrolled,
      startDate: player.universityStart,
      endDate: player.universityEnd,
      startYear: player.universityStart.getFullYear(),
      endYear: player.universityEnd.getFullYear(),
      faculty: player.faculty,
      department: player.department,
      status: DataStatus.pending,
      sourceId: source.id,
    });
    await ensureSeedMembership({
      personId: person.id,
      organizationId: player.highSchool.id,
      type: MembershipType.enrolled,
      startDate: player.highSchoolStart,
      endDate: player.highSchoolEnd,
      startYear: player.highSchoolStart.getFullYear(),
      endYear: player.highSchoolEnd.getFullYear(),
      status: DataStatus.pending,
      sourceId: source.id,
    });
    if (player.currentTeam && player.currentTeamStart) {
      await ensureSeedMembership({
        personId: person.id,
        organizationId: player.currentTeam.id,
        type: MembershipType.affiliated,
        startDate: player.currentTeamStart,
        startYear: player.currentTeamStart.getFullYear(),
        status: DataStatus.pending,
        sourceId: player.currentTeamSourceId ?? source.id,
      });
    }

    for (const pb of player.pbs) {
      await upsertPersonalBestSnapshot(prisma, {
        personId: person.id,
        discipline: pb.discipline,
        mark: pb.mark,
        notes: pb.notes ?? "",
        sourceId: pb.sourceId,
      });
      await prisma.personalBest.updateMany({
        where: {
          personId: person.id,
          discipline: pb.discipline,
          mark: pb.mark,
        },
        data: {
          markMillis: markToMilliseconds(pb.mark),
          achievedOn: pb.achievedOn ?? undefined,
          competitionName: pb.competitionName ?? undefined,
          venue: pb.venue ?? undefined,
          status: DataStatus.pending,
          notes: pb.notes ?? undefined,
          sourceId: pb.sourceId,
        },
      });
    }

    const raceResults = player.raceResults;

    if (raceResults) {
      await prisma.raceResult.deleteMany({ where: { personId: person.id } });
      for (const result of raceResults) {
        await replaceRaceResult({
          personId: person.id,
          organizationId: result.organization.id,
          raceId: result.race.id,
          mark: result.mark,
          rank: result.rank,
          gradeAtRace: result.gradeAtRace,
          notes: result.notes,
          sourceId: result.sourceId,
        });
      }
    } else {
      if (!player.hakoneRace) {
        continue;
      }

      await replaceRaceResult({
        personId: person.id,
        organizationId: player.university.id,
        raceId: player.hakoneRace.id,
        mark: player.hakoneMark,
        rank: player.hakoneRank,
        gradeAtRace: player.grade,
        status: DataStatus.pending,
        notes: player.hakoneNotes,
        sourceId: source.id,
      });
    }
  }

  async function upsertRaceEntries(input: {
    entries: SeedRaceEntry[];
    race: Race;
    sourceId: string;
    pbNotes: string;
  }) {
    for (const entry of input.entries) {
      const isCompetitionOnlyTeam = entry.universitySlug === "kanto-student-union";
      const university = universityBySlug.get(entry.universitySlug);
      const highSchool = highSchoolBySlug.get(entry.highSchoolSlug);

      if (!university || !highSchool) {
        throw new Error(`Missing organization for ${entry.displayNameJa}`);
      }

      const person = await upsertSeedPerson({
        slug: entry.slug,
        displayNameJa: entry.displayNameJa,
        displayNameRoman: entry.displayNameRoman,
        status: DataStatus.pending,
      });

      if (!protectedProfileSlugs.has(entry.slug) && !isCompetitionOnlyTeam) {
        const dates = academicDatesForGrade(entry.grade);

        await ensureSeedMembership({
          personId: person.id,
          organizationId: university.id,
          type: MembershipType.enrolled,
          startDate: dates.universityStart,
          endDate: dates.universityEnd,
          startYear: dates.universityStart.getFullYear(),
          endYear: dates.universityEnd.getFullYear(),
          status: DataStatus.pending,
          sourceId: input.sourceId,
        });
        await ensureSeedMembership({
          personId: person.id,
          organizationId: highSchool.id,
          type: MembershipType.enrolled,
          startDate: dates.highSchoolStart,
          endDate: dates.highSchoolEnd,
          startYear: dates.highSchoolStart.getFullYear(),
          endYear: dates.highSchoolEnd.getFullYear(),
          status: DataStatus.pending,
          sourceId: input.sourceId,
        });
      } else if (isCompetitionOnlyTeam) {
        const dates = academicDatesForGrade(entry.grade);

        await ensureSeedMembership({
          personId: person.id,
          organizationId: highSchool.id,
          type: MembershipType.enrolled,
          startDate: dates.highSchoolStart,
          endDate: dates.highSchoolEnd,
          startYear: dates.highSchoolStart.getFullYear(),
          endYear: dates.highSchoolEnd.getFullYear(),
          status: DataStatus.pending,
          sourceId: input.sourceId,
        });
      }

      if (!protectedProfileSlugs.has(entry.slug)) {
        for (const pb of entry.pbs) {
          await upsertPersonalBestSnapshot(prisma, {
            personId: person.id,
            discipline: pb.discipline,
            mark: pb.mark,
            notes: input.pbNotes,
            sourceId: input.sourceId,
          });
        }
      }

      await replaceRaceResult({
        personId: person.id,
        organizationId: university.id,
        raceId: input.race.id,
        mark: entry.mark,
        rank: entry.rank,
        gradeAtRace: entry.grade,
        status: DataStatus.pending,
        notes: entry.notes,
        sourceId: verifiedHakoneSourceBySlug.get(entry.slug) ?? input.sourceId,
      });
    }
  }

  await upsertRaceEntries({
    entries: hakone102Leg1Entries,
    race: hakone102Leg1,
    sourceId: ntvHakone102Leg1Source.id,
    pbNotes: "第102回箱根駅伝 NTV ページの公認最高タイム摘要。PB の正式確認は後続タスクで再確認。",
  });
  await upsertRaceEntries({
    entries: hakone102Leg2Entries,
    race: hakone102Leg2,
    sourceId: ntvHakone102Leg2Source.id,
    pbNotes: "第102回箱根駅伝 NTV ページの公認最高タイム摘要。PB の正式確認は後続タスクで再確認。",
  });
  await upsertRaceEntries({
    entries: hakone102Leg5Entries,
    race: hakone102Leg5,
    sourceId: ntvHakone102Leg5Source.id,
    pbNotes: "第102回箱根駅伝 NTV ページの持ちタイム摘要。PB としての公式確認は後続タスクで再確認。",
  });
  await upsertRaceEntries({
    entries: hakone101Leg2Entries,
    race: hakone101Leg2,
    sourceId: ntvHakone101Leg2Source.id,
    pbNotes: "第101回箱根駅伝 NTV ページの持ちタイム摘要。PB としての公式確認は後続タスクで再確認。",
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
