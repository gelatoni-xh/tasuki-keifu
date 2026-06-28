import "dotenv/config";
import {
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
  registeredPrefecture: string | null;
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
  pbs: SeedPersonalBest[];
  hakoneRace?: Race;
  hakoneMark?: string | null;
  hakoneRank?: number | null;
  hakoneNotes?: string | null;
  raceResults?: SeedRaceResult[];
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
  websiteUrl?: string;
}) {
  return prisma.organization.upsert({
    where: { slug: input.slug },
    update: input,
    create: {
      ...input,
      status: DataStatus.pending,
    },
  });
}

async function upsertCompetition(input: {
  slug: string;
  nameJa: string;
  nameRoman?: string;
  nameZh?: string;
  nameEn?: string;
  type?: string;
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
  return prisma.competitionEdition.upsert({
    where: { slug: input.slug },
    update: input,
    create: input,
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

  const aogaku = await upsertOrganization({
    slug: "aoyama-gakuin-university",
    nameJa: "青山学院大学",
    shortName: "青学大",
    type: OrganizationType.university,
    prefecture: "東京都",
    websiteUrl: "https://aogaku-tf.com/",
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
  const kantoStudentUnion = await upsertOrganization({
    slug: "kanto-student-union",
    nameJa: "関東学生連合",
    shortName: "関東学生連合",
    type: OrganizationType.federation,
    prefecture: "東京都",
  });
  const gmo = await upsertOrganization({
    slug: "gmo-internet-group",
    nameJa: "GMOインターネットグループ",
    shortName: "GMO",
    type: OrganizationType.corporate_team,
    prefecture: "東京都",
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
    type: "road_marathon",
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
      kantoStudentUnion,
    ].map((organization) => [organization.slug, organization]),
  );
  const highSchoolBySlug = new Map(
    [
      tamano,
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
      registeredPrefecture: "岡山",
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
      registeredPrefecture: null,
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
      slug: "shunkyo-yoshii",
      displayNameJa: "吉居 駿恭",
      displayNameKana: "よしい しゅんきょう",
      displayNameRoman: "Shunkyo Yoshii",
      birthDate: null,
      hometown: null,
      nationality: null,
      registeredPrefecture: null,
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

  for (const player of players) {
    const person = await prisma.person.upsert({
      where: { slug: player.slug },
      update: {
        displayNameJa: player.displayNameJa,
        displayNameKana: player.displayNameKana,
        displayNameRoman: player.displayNameRoman,
        birthDate: player.birthDate,
        hometown: player.hometown,
        nationality: player.nationality,
        registeredPrefecture: player.registeredPrefecture,
      },
      create: {
        slug: player.slug,
        displayNameJa: player.displayNameJa,
        displayNameKana: player.displayNameKana,
        displayNameRoman: player.displayNameRoman,
        birthDate: player.birthDate,
        hometown: player.hometown,
        nationality: player.nationality,
        registeredPrefecture: player.registeredPrefecture,
        type: "athlete",
        status: DataStatus.pending,
      },
    });

    await prisma.membership.deleteMany({ where: { personId: person.id } });
    await prisma.membership.createMany({
      data: [
        {
          personId: person.id,
          organizationId: player.university.id,
          type: MembershipType.enrolled,
          startDate: player.universityStart,
          endDate: player.universityEnd,
          startYear: player.universityStart.getFullYear(),
          endYear: player.universityEnd.getFullYear(),
          grade: player.grade,
          status: DataStatus.pending,
          sourceId: source.id,
        },
        {
          personId: person.id,
          organizationId: player.highSchool.id,
          type: MembershipType.enrolled,
          startDate: player.highSchoolStart,
          endDate: player.highSchoolEnd,
          startYear: player.highSchoolStart.getFullYear(),
          endYear: player.highSchoolEnd.getFullYear(),
          status: DataStatus.pending,
          sourceId: source.id,
        },
        ...(player.currentTeam && player.currentTeamStart
          ? [
              {
                personId: person.id,
                organizationId: player.currentTeam.id,
                type: MembershipType.affiliated,
                startDate: player.currentTeamStart,
                startYear: player.currentTeamStart.getFullYear(),
                status: DataStatus.pending,
                sourceId: player.currentTeamSourceId ?? source.id,
              },
            ]
          : []),
      ],
    });

    await prisma.personalBest.deleteMany({ where: { personId: person.id } });
    for (const pb of player.pbs) {
      await prisma.personalBest.create({
        data: {
          personId: person.id,
          discipline: pb.discipline,
          mark: pb.mark,
          achievedOn: pb.achievedOn,
          competitionName: pb.competitionName,
          venue: pb.venue,
          status: DataStatus.pending,
          notes: pb.notes,
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

  for (const entry of hakone102Leg5Entries) {
    const university = universityBySlug.get(entry.universitySlug);
    const highSchool = highSchoolBySlug.get(entry.highSchoolSlug);

    if (!university || !highSchool) {
      throw new Error(`Missing organization for ${entry.displayNameJa}`);
    }

    const person = await prisma.person.upsert({
      where: { slug: entry.slug },
      update: {
        displayNameJa: entry.displayNameJa,
        displayNameRoman: entry.displayNameRoman,
      },
      create: {
        slug: entry.slug,
        displayNameJa: entry.displayNameJa,
        displayNameRoman: entry.displayNameRoman,
        type: "athlete",
        status: DataStatus.pending,
      },
    });

    if (entry.slug !== "asahi-kuroda") {
      const dates = academicDatesForGrade(entry.grade);

      await prisma.membership.deleteMany({ where: { personId: person.id } });
      await prisma.membership.createMany({
        data: [
          {
            personId: person.id,
            organizationId: university.id,
            type: MembershipType.enrolled,
            startDate: dates.universityStart,
            endDate: dates.universityEnd,
            startYear: dates.universityStart.getFullYear(),
            endYear: dates.universityEnd.getFullYear(),
            grade: entry.grade,
            status: DataStatus.pending,
            sourceId: ntvHakone102Leg5Source.id,
          },
          {
            personId: person.id,
            organizationId: highSchool.id,
            type: MembershipType.enrolled,
            startDate: dates.highSchoolStart,
            endDate: dates.highSchoolEnd,
            startYear: dates.highSchoolStart.getFullYear(),
            endYear: dates.highSchoolEnd.getFullYear(),
            status: DataStatus.pending,
            sourceId: ntvHakone102Leg5Source.id,
          },
        ],
      });

      await prisma.personalBest.deleteMany({ where: { personId: person.id } });
      for (const pb of entry.pbs) {
        await prisma.personalBest.create({
          data: {
            personId: person.id,
            discipline: pb.discipline,
            mark: pb.mark,
            status: DataStatus.pending,
            notes: "第102回箱根駅伝 NTV ページの持ちタイム摘要。PB としての公式確認は後続タスクで再確認。",
            sourceId: ntvHakone102Leg5Source.id,
          },
        });
      }
    }

    await replaceRaceResult({
      personId: person.id,
      organizationId: university.id,
      raceId: hakone102Leg5.id,
      mark: entry.mark,
      rank: entry.rank,
      gradeAtRace: entry.grade,
      status: DataStatus.pending,
      notes: entry.notes,
      sourceId: entry.slug === "asahi-kuroda" ? hakoneOfficialSource.id : ntvHakone102Leg5Source.id,
    });
  }
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
