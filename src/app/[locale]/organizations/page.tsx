import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatOrganizationType } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";

type OrganizationsPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function OrganizationsPage({ params }: OrganizationsPageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const organizations = await prisma.organization.findMany({
    include: {
      _count: {
        select: { memberships: true, raceResults: true },
      },
    },
    orderBy: [{ type: "asc" }, { nameJa: "asc" }],
  });

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path="/organizations" />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="flex flex-col justify-between gap-4 border-b border-[#ded8cc] pb-6 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold">{dictionary.organizations.listTitle}</h1>
              <p className="mt-2 text-sm text-[#59615c]">{dictionary.organizations.listDescription}</p>
            </div>
            <p className="text-sm font-medium text-[#8a1f2d]">
              {interpolate(dictionary.organizations.resultCount, { count: organizations.length })}
            </p>
          </header>

          <div className="divide-y divide-[#e7e1d8] border-y border-[#ded8cc] bg-white">
            {organizations.map((organization) => (
              <Link
                className="grid gap-3 px-4 py-5 transition hover:bg-[#fbfaf7] md:grid-cols-[1.3fr_0.8fr_0.7fr_auto]"
                href={`/${locale}/organizations/${organization.slug}`}
                key={organization.id}
              >
                <div>
                  <h2 className="text-xl font-semibold">{organization.nameJa}</h2>
                  <p className="mt-2 text-sm text-[#59615c]">{organization.shortName ?? dictionary.common.emptyDash}</p>
                </div>
                <div className="text-sm text-[#59615c]">
                  <p className="text-xs font-medium text-[#8b938e]">{dictionary.organizations.type}</p>
                  <p className="mt-1">{formatOrganizationType(organization.type, locale)}</p>
                </div>
                <div className="text-sm text-[#59615c]">
                  <p className="text-xs font-medium text-[#8b938e]">{dictionary.organizations.affiliatedPlayers}</p>
                  <p className="mt-1">{organization._count.memberships}</p>
                </div>
                <span className="inline-flex items-center gap-1 self-center text-sm font-medium text-[#8a1f2d]">
                  {dictionary.organizations.affiliatedPlayers}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
