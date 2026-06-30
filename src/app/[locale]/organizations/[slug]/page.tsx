import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatDate, formatOrganizationType } from "@/lib/format";
import { getDictionary, isLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/site";

type OrganizationDetailPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
};

export async function generateMetadata({ params }: OrganizationDetailPageProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const locale = localeParam;
  const organization = await prisma.organization.findUnique({
    where: { slug },
    include: {
      _count: {
        select: {
          memberships: true,
          raceResults: true,
        },
      },
    },
  });

  if (!organization) {
    return {};
  }

  const title = `${organization.nameJa}の所属選手・関連データ`;
  const description = [
    `${organization.nameJa}の組織ページです。`,
    `${formatOrganizationType(organization.type, locale)}として収録しています。`,
    organization._count.memberships > 0 ? `関連選手を${organization._count.memberships}件収録。` : null,
    organization.location ?? organization.prefecture ? `所在地は${organization.location ?? organization.prefecture}。` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/organizations/${slug}`,
      languages: buildLocaleAlternates(`/organizations/${slug}`),
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/organizations/${slug}`,
    },
  };
}

export default async function OrganizationDetailPage({ params }: OrganizationDetailPageProps) {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const organization = await prisma.organization.findUnique({
    where: { slug },
    include: {
      memberships: {
        include: {
          person: true,
        },
        orderBy: [{ startDate: "desc" }, { startYear: "desc" }],
      },
    },
  });

  if (!organization) {
    notFound();
  }

  const now = new Date();
  const currentMemberships = organization.memberships.filter((membership) => {
    const startsBeforeNow = !membership.startDate || membership.startDate <= now;
    const hasNotEnded = !membership.endDate || membership.endDate >= now;

    return startsBeforeNow && hasNotEnded;
  });
  const formerMemberships = organization.memberships.filter((membership) => !currentMemberships.includes(membership));
  const formatMembershipSummary = (startDate: Date | null, startYear: number | null, endDate: Date | null, endYear: number | null) => {
    const start = formatDate(startDate) || startYear?.toString() || dictionary.common.emptyDash;
    const end = formatDate(endDate) || endYear?.toString() || dictionary.common.present;

    return `${start} - ${end}`;
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path={`/organizations/${organization.slug}`} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-[#8a1f2d]"
            href={`/${locale}/organizations`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {dictionary.organizations.backToList}
          </Link>

          <header className="border border-[#ded8cc] bg-white p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]">
                  {formatOrganizationType(organization.type, locale)}
                </p>
                <h1 className="mt-3 text-4xl font-semibold">{organization.nameJa}</h1>
                <p className="mt-3 text-sm text-[#59615c]">
                  {organization.location ?? organization.prefecture ?? dictionary.common.emptyDash}
                </p>
              </div>
              {organization.websiteUrl ? (
                <a
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                  data-analytics-event="source_outbound_click"
                  data-analytics-link-type="organization_website"
                  href={organization.websiteUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {dictionary.organizations.website}
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </header>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.organizations.currentPlayers}</h2>
              {currentMemberships.length > 0 ? (
                <div className="mt-4 divide-y divide-[#e7e1d8]">
                  {currentMemberships.map((membership) => (
                    <Link
                      className="grid gap-2 py-3 text-sm transition hover:text-[#8a1f2d] sm:grid-cols-[1fr_auto]"
                      data-analytics-event="player_profile_view"
                      data-analytics-link-type="organization_current_player"
                      href={`/${locale}/players/${membership.person.slug}`}
                      key={membership.id}
                    >
                      <span className="font-semibold">{membership.person.displayNameJa}</span>
                      <span className="text-[#59615c]">
                        {formatMembershipSummary(membership.startDate, membership.startYear, membership.endDate, membership.endYear)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#59615c]">{dictionary.organizations.emptyPlayers}</p>
              )}
            </div>

            <div className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.organizations.formerPlayers}</h2>
              {formerMemberships.length > 0 ? (
                <div className="mt-4 divide-y divide-[#e7e1d8]">
                  {formerMemberships.map((membership) => (
                    <Link
                      className="grid gap-2 py-3 text-sm transition hover:text-[#8a1f2d] sm:grid-cols-[1fr_auto]"
                      data-analytics-event="player_profile_view"
                      data-analytics-link-type="organization_former_player"
                      href={`/${locale}/players/${membership.person.slug}`}
                      key={membership.id}
                    >
                      <span className="font-semibold">{membership.person.displayNameJa}</span>
                      <span className="text-[#59615c]">
                        {formatMembershipSummary(membership.startDate, membership.startYear, membership.endDate, membership.endYear)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#59615c]">{dictionary.organizations.emptyPlayers}</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
