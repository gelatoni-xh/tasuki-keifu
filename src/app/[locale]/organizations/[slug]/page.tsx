import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMembershipRole, formatOrganizationType, formatRaceMark, formatRankWithNotes } from "@/lib/format";
import { getDictionary, isLocale } from "@/lib/i18n";
import { groupMembershipsByRole, isCurrentMembership } from "@/lib/membership";
import { buildPageMetadata } from "@/lib/site";

type OrganizationDetailPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
};

function getOrganizationSeoTier({
  memberships,
  raceResults,
  teamResults,
}: {
  memberships: number;
  raceResults: number;
  teamResults: number;
}) {
  if (memberships >= 15 || raceResults >= 28 || teamResults >= 4) {
    return "primary";
  }

  if (memberships >= 6 || raceResults >= 7 || teamResults >= 1) {
    return "secondary";
  }

  return "thin";
}

export async function generateMetadata({ params }: OrganizationDetailPageProps): Promise<Metadata> {
  const { locale: localeParam, slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

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

  const title = `${organization.nameJa}の所属人物・関連データ`;
  const seoTier = getOrganizationSeoTier({
    memberships: organization._count.memberships,
    raceResults: organization._count.raceResults,
    teamResults: 0,
  });
  const description = [
    `${organization.nameJa}の組織ページです。`,
    `${formatOrganizationType(organization.type, locale)}として収録しています。`,
    organization._count.memberships > 0 ? `関連人物を${organization._count.memberships}件収録。` : null,
    organization.location ?? organization.prefecture ? `所在地は${organization.location ?? organization.prefecture}。` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const metadata = buildPageMetadata({
    title,
    description,
    path: `/organizations/${slug}`,
    locale,
    keywords: [
      organization.nameJa,
      formatOrganizationType(organization.type, locale),
      "所属人物",
      "駅伝チーム",
    ],
  });

  if (seoTier === "thin") {
    metadata.robots = {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
      },
    };
  }

  return metadata;
}

export default async function OrganizationDetailPage({ params }: OrganizationDetailPageProps) {
  const { locale: localeParam, slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

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
      teamCompetitionResults: {
        include: {
          competitionEdition: {
            include: {
              competition: true,
            },
          },
        },
        orderBy: [
          { competitionEdition: { year: "desc" } },
          { finalRank: "asc" },
        ],
      },
    },
  });

  if (!organization) {
    notFound();
  }

  const now = new Date();
  const currentMemberships = organization.memberships.filter((membership) => isCurrentMembership(membership, now));
  const formerMemberships = organization.memberships.filter((membership) => !currentMemberships.includes(membership));
  const currentByRole = groupMembershipsByRole(currentMemberships);
  const formerByRole = groupMembershipsByRole(formerMemberships);
  const ekidenResults = organization.teamCompetitionResults.filter((result) =>
    result.competitionEdition.competition.type?.includes("ekiden"),
  );
  const formatMembershipSummary = (startDate: Date | null, startYear: number | null, endDate: Date | null, endYear: number | null) => {
    const start = formatDate(startDate) || startYear?.toString() || dictionary.common.emptyDash;
    const end = formatDate(endDate) || endYear?.toString() || dictionary.common.present;

    return `${start} - ${end}`;
  };

  const membershipSections = [
    { key: "athlete", label: formatMembershipRole("athlete", locale), current: currentByRole.athlete, former: formerByRole.athlete },
    { key: "coach", label: formatMembershipRole("coach", locale), current: currentByRole.coach, former: formerByRole.coach },
    { key: "staff", label: formatMembershipRole("staff", locale), current: currentByRole.staff, former: formerByRole.staff },
  ];
  const seoTier = getOrganizationSeoTier({
    memberships: organization.memberships.length,
    raceResults: 0,
    teamResults: organization.teamCompetitionResults.length,
  });
  const highlightedEditions = ekidenResults.slice(0, 5).map((result) => result.competitionEdition.shortName ?? result.competitionEdition.officialName);
  const highlightedPeople = organization.memberships
    .slice(0, 8)
    .map((membership) => membership.person.displayNameJa)
    .filter((name, index, list) => list.indexOf(name) === index);
  const organizationSummary = [
    `${organization.nameJa}は、${formatOrganizationType(organization.type, locale)}として収録している組織ページです。`,
    organization.memberships.length > 0 ? `現在までに${organization.memberships.length}件の所属関係を確認しています。` : null,
    ekidenResults.length > 0 ? `駅伝大会では${ekidenResults.length}件のチーム成績を掲載しています。` : null,
    highlightedEditions.length > 0 ? `主な関連大会として${highlightedEditions.join("、")}などを確認できます。` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: organization.nameJa,
    alternateName: organization.shortName ?? undefined,
    description: organizationSummary,
    sport: "Ekiden",
    url: `https://tasukikeifu.com/${locale}/organizations/${organization.slug}`,
    location: organization.location ?? organization.prefecture ?? undefined,
    sameAs: organization.websiteUrl ?? undefined,
    member: highlightedPeople.map((name) => ({
      "@type": "Person",
      name,
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "襷の系譜",
        item: `https://tasukikeifu.com/${locale}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "組織一覧",
        item: `https://tasukikeifu.com/${locale}/organizations`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: organization.nameJa,
        item: `https://tasukikeifu.com/${locale}/organizations/${organization.slug}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
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
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#59615c]">
                  {organizationSummary}
                </p>
              </div>
              <div className="flex flex-col items-start gap-3">
                <span
                  className={`border px-3 py-1 text-sm ${
                    seoTier === "primary"
                      ? "border-[#c9d7c6] bg-[#eef6ec] text-[#29543a]"
                      : seoTier === "secondary"
                        ? "border-[#d8cfbf] bg-[#f6f1e8] text-[#7a5d2d]"
                        : "border-[#ded8cc] bg-white text-[#59615c]"
                  }`}
                >
                  {seoTier === "primary" ? "Complete page" : seoTier === "secondary" ? "Growing page" : "Seed page"}
                </span>
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
            </div>
          </header>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.organizations.currentPeople}</h2>
              {currentMemberships.length > 0 ? (
                <div className="mt-4 space-y-5">
                  {membershipSections.map((section) =>
                    section.current.length > 0 ? (
                      <div key={section.key}>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8a1f2d]">{section.label}</h3>
                        <div className="mt-2 divide-y divide-[#e7e1d8]">
                          {section.current.map((membership) => (
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
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#59615c]">{dictionary.organizations.emptyPeople}</p>
              )}
            </div>

            <div className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.organizations.formerPeople}</h2>
              {formerMemberships.length > 0 ? (
                <div className="mt-4 space-y-5">
                  {membershipSections.map((section) =>
                    section.former.length > 0 ? (
                      <div key={section.key}>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8a1f2d]">{section.label}</h3>
                        <div className="mt-2 divide-y divide-[#e7e1d8]">
                          {section.former.map((membership) => (
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
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#59615c]">{dictionary.organizations.emptyPeople}</p>
              )}
            </div>
          </section>

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.organizations.ekidenResults}</h2>
            {ekidenResults.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid grid-cols-[1.2fr_1.3fr_120px_140px] bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]">
                    <span>{dictionary.organizations.competition}</span>
                    <span>{dictionary.organizations.edition}</span>
                    <span>{dictionary.organizations.finalRank}</span>
                    <span>{dictionary.organizations.finalMark}</span>
                  </div>
                  <div className="divide-y divide-[#e7e1d8]">
                    {ekidenResults.map((result) => (
                      <Link
                        className="grid grid-cols-[1.2fr_1.3fr_120px_140px] px-3 py-3 text-sm transition hover:bg-[#fbfaf7]"
                        href={`/${locale}/competitions/${result.competitionEdition.slug}`}
                        key={result.id}
                      >
                        <span>{result.competitionEdition.competition.nameJa}</span>
                        <span className="font-medium text-[#8a1f2d]">
                          {result.competitionEdition.shortName ?? result.competitionEdition.officialName}
                        </span>
                        <span className="text-[#59615c]">
                          {formatRankWithNotes(result.finalRank, result.notes, locale) || dictionary.common.emptyDash}
                        </span>
                        <span className="text-[#59615c]">{result.finalMark ? formatRaceMark(result.finalMark, locale) : dictionary.common.emptyDash}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[#59615c]">{dictionary.organizations.emptyEkidenResults}</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
