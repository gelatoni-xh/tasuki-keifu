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
    where: { id: 'source-ntv-hakone-102-leg-9' },
    update: {
      name: '日本テレビ 第102回箱根駅伝 9区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/9.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 9区の区間順位、区間タイム、学年、出身校の参照元。',
    },
    create: {
      id: 'source-ntv-hakone-102-leg-9',
      name: '日本テレビ 第102回箱根駅伝 9区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/9.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 9区の区間順位、区間タイム、学年、出身校の参照元。',
    },
  });

  await upsertOrganization({ slug: 'takudai-daiichi-high-school', nameJa: '拓殖大学第一高校', type: OrganizationType.high_school, prefecture: '東京都' });
  await upsertOrganization({ slug: 'komazawa-university-high-school', nameJa: '駒澤大学高校', type: OrganizationType.high_school, prefecture: '東京都' });
  await upsertOrganization({ slug: 'toin-high-school', nameJa: '藤蔭高校', type: OrganizationType.high_school, prefecture: '大分県' });
  await upsertOrganization({ slug: 'chinzei-gakuin-high-school', nameJa: '鎮西学院高校', type: OrganizationType.high_school, prefecture: '長崎県' });
  await upsertOrganization({ slug: 'tokai-dai-fukuoka-high-school', nameJa: '東海大学付属福岡高校', type: OrganizationType.high_school, prefecture: '福岡県' });
  await upsertOrganization({ slug: 'yamanashi-gakuin-high-school', nameJa: '山梨学院高校', type: OrganizationType.high_school, prefecture: '山梨県' });
  await upsertOrganization({ slug: 'seiho-high-school', nameJa: '清峰高校', type: OrganizationType.high_school, prefecture: '長崎県' });
  await upsertOrganization({ slug: 'toyokawa-koka-high-school', nameJa: '豊川工科高校', type: OrganizationType.high_school, prefecture: '愛知県' });
  await upsertOrganization({ slug: 'keiho-high-school', nameJa: '瓊浦高校', type: OrganizationType.high_school, prefecture: '長崎県' });
  await upsertOrganization({ slug: 'tokamachi-high-school', nameJa: '十日町高校', type: OrganizationType.high_school, prefecture: '新潟県' });
  await upsertOrganization({ slug: 'nagareyama-minami-high-school', nameJa: '流山南高校', type: OrganizationType.high_school, prefecture: '千葉県' });

  const edition = await prisma.competitionEdition.findUnique({ where: { slug: 'hakone-ekiden-102' } });
  if (!edition) throw new Error('Missing competition edition: hakone-ekiden-102');

  await prisma.race.upsert({
    where: { slug: 'hakone-ekiden-102-leg-9' },
    update: {
      competitionEditionId: edition.id,
      name: '9区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 9,
      sourceId: source.id,
      status: DataStatus.pending,
    },
    create: {
      slug: 'hakone-ekiden-102-leg-9',
      competitionEditionId: edition.id,
      name: '9区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 9,
      sourceId: source.id,
      status: DataStatus.pending,
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
