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
    where: { id: 'source-ntv-hakone-102-leg-4' },
    update: {
      name: '日本テレビ 第102回箱根駅伝 4区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/4.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 4区の区間順位、区間タイム、学年、出身校の参照元。',
    },
    create: {
      id: 'source-ntv-hakone-102-leg-4',
      name: '日本テレビ 第102回箱根駅伝 4区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/4.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 4区の区間順位、区間タイム、学年、出身校の参照元。',
    },
  });

  await upsertOrganization({ slug: 'chubu-university-daiichi-high-school', nameJa: '中部大学第一高校', type: OrganizationType.high_school, prefecture: '愛知県' });
  await upsertOrganization({ slug: 'sera-high-school', nameJa: '世羅高校', type: OrganizationType.high_school, prefecture: '広島県' });
  await upsertOrganization({ slug: 'fukuoka-daiichi-high-school', nameJa: '福岡第一高校', type: OrganizationType.high_school, prefecture: '福岡県' });
  await upsertOrganization({ slug: 'tosu-technical-high-school', nameJa: '鳥栖工業高校', type: OrganizationType.high_school, prefecture: '佐賀県' });
  await upsertOrganization({ slug: 'kagoshima-commercial-high-school', nameJa: '鹿児島商業高校', type: OrganizationType.high_school, prefecture: '鹿児島県' });
  await upsertOrganization({ slug: 'goto-minami-high-school', nameJa: '五島南高校', type: OrganizationType.high_school, prefecture: '長崎県' });
  await upsertOrganization({ slug: 'saikyo-high-school', nameJa: '西京高校', type: OrganizationType.high_school, prefecture: '京都府' });
  await upsertOrganization({ slug: 'sakado-nishi-high-school', nameJa: '坂戸西高校', type: OrganizationType.high_school, prefecture: '埼玉県' });
  await upsertOrganization({ slug: 'suma-gakuen-high-school', nameJa: '須磨学園高校', type: OrganizationType.high_school, prefecture: '兵庫県' });
  await upsertOrganization({ slug: 'azabu-high-school', nameJa: '麻布高校', type: OrganizationType.high_school, prefecture: '東京都' });

  const edition = await prisma.competitionEdition.findUnique({ where: { slug: 'hakone-ekiden-102' } });
  if (!edition) throw new Error('Missing competition edition: hakone-ekiden-102');

  await prisma.race.upsert({
    where: { slug: 'hakone-ekiden-102-leg-4' },
    update: {
      competitionEditionId: edition.id,
      name: '4区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 4,
      sourceId: source.id,
      status: DataStatus.pending,
    },
    create: {
      slug: 'hakone-ekiden-102-leg-4',
      competitionEditionId: edition.id,
      name: '4区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 4,
      sourceId: source.id,
      status: DataStatus.pending,
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
