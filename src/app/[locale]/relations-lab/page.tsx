import { notFound } from "next/navigation";
import { connection } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getDictionary, isLocale } from "@/lib/i18n";
import { RelationsLab } from "@/components/relations-lab";
import { SiteHeader } from "@/components/site-header";
import { buildPageMetadata } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = getDictionary(locale).relationsLab;
  return buildPageMetadata({ title: copy.title, description: copy.description, path: "/relations-lab", locale });
}

const getRelationsLabData = unstable_cache(async () => {
  const organizations = await prisma.organization.findMany({
    where: { type: { in: ["high_school", "university", "corporate_team"] } },
    select: { id: true, nameJa: true, type: true, memberships: { where: { role: "athlete", person: { type: "athlete" } }, select: { personId: true } } },
  });
  const ranked = organizations.map((org) => ({ id: org.id, name: org.nameJa, type: org.type, count: new Set(org.memberships.map((m) => m.personId)).size }))
    .filter((org) => org.count >= 3).sort((a, b) => b.count - a.count);
  const selected = ranked;
  const people = await prisma.person.findMany({
    where: { type: "athlete", memberships: { some: { organizationId: { in: selected.map((org) => org.id) }, role: "athlete" } } },
    select: { id: true, slug: true, displayNameJa: true, memberships: {
      where: { organizationId: { in: selected.map((org) => org.id) }, role: "athlete" },
      select: { organizationId: true, startYear: true, endYear: true, startDate: true, endDate: true, endState: true },
    } },
    orderBy: { displayNameJa: "asc" },
  });
  return { organizations: selected, people: people.map((person) => ({
    id: person.id, slug: person.slug, name: person.displayNameJa,
    memberships: person.memberships.map((m) => ({ org: m.organizationId, start: m.startDate?.getUTCFullYear() ?? m.startYear, end: m.endDate?.getUTCFullYear() ?? m.endYear, ongoing: m.endState === "ongoing" })),
  })) };
}, ["relations-lab-data-v1"], { revalidate: 300 });

export default async function RelationsLabPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const data = await getRelationsLabData();
  return <><SiteHeader locale={locale} path="/relations-lab" /><RelationsLab locale={locale} {...data} /></>;
}
