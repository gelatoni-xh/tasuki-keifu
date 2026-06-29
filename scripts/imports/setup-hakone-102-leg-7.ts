import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, DataStatus, EventDiscipline, OrganizationType, SourceType } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

async function upsertOrganization(input: { slug: string; nameJa: string; type: OrganizationType; prefecture?: string }) {
  return prisma.organization.upsert({
    where: { slug: input.slug },
    update: input,
    create: { ...input, status: DataStatus.pending },
  });
}

async function main() {
  const source = await prisma.source.upsert({
    where: { id: 'source-ntv-hakone-102-leg-7' },
    update: {
      name: '日本テレビ 第102回箱根駅伝 7区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/7.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 7区の区間順位、区間タイム、学年、出身校の参照元。',
    },
    create: {
      id: 'source-ntv-hakone-102-leg-7',
      name: '日本テレビ 第102回箱根駅伝 7区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/7.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 7区の区間順位、区間タイム、学年、出身校の参照元。',
    },
  });

  await upsertOrganization({ slug: 'teikyo-asaka-high-school', nameJa: '帝京安積高校', type: OrganizationType.high_school, prefecture: '福島県' });
  await upsertOrganization({ slug: 'takagawa-gakuen-high-school', nameJa: '高川学園高校', type: OrganizationType.high_school, prefecture: '山口県' });
  await upsertOrganization({ slug: 'kandai-hokuyo-high-school', nameJa: '関西大学北陽高校', type: OrganizationType.high_school, prefecture: '大阪府' });
  await upsertOrganization({ slug: 'hamamatsu-commercial-high-school', nameJa: '浜松商業高校', type: OrganizationType.high_school, prefecture: '静岡県' });
  await upsertOrganization({ slug: 'seibudai-chiba-high-school', nameJa: '西武台千葉高校', type: OrganizationType.high_school, prefecture: '千葉県' });
  await upsertOrganization({ slug: 'oita-tomei-high-school', nameJa: '大分東明高校', type: OrganizationType.high_school, prefecture: '大分県' });
  await upsertOrganization({ slug: 'kagoshima-josei-high-school', nameJa: '鹿児島城西高校', type: OrganizationType.high_school, prefecture: '鹿児島県' });
  await upsertOrganization({ slug: 'sapporo-yamanote-high-school', nameJa: '札幌山の手高校', type: OrganizationType.high_school, prefecture: '北海道' });
  await upsertOrganization({ slug: 'okazaki-josei-high-school', nameJa: '岡崎城西高校', type: OrganizationType.high_school, prefecture: '愛知県' });
  await upsertOrganization({ slug: 'ichinoseki-gakuin-high-school', nameJa: '一関学院高校', type: OrganizationType.high_school, prefecture: '岩手県' });
  await upsertOrganization({ slug: 'chiben-nara-college-high-school', nameJa: '智辯奈良カレッジ高校', type: OrganizationType.high_school, prefecture: '奈良県' });
  await upsertOrganization({ slug: 'rokko-gakuin-high-school', nameJa: '六甲学院高校', type: OrganizationType.high_school, prefecture: '兵庫県' });

  const edition = await prisma.competitionEdition.findUnique({ where: { slug: 'hakone-ekiden-102' } });
  if (!edition) throw new Error('Missing competition edition: hakone-ekiden-102');

  await prisma.race.upsert({
    where: { slug: 'hakone-ekiden-102-leg-7' },
    update: {
      competitionEditionId: edition.id,
      name: '7区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 7,
      sourceId: source.id,
      status: DataStatus.pending,
    },
    create: {
      slug: 'hakone-ekiden-102-leg-7',
      competitionEditionId: edition.id,
      name: '7区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 7,
      sourceId: source.id,
      status: DataStatus.pending,
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
