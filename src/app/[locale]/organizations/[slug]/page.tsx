import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMembershipRole, formatOrganizationType, formatRaceMark, formatRankWithNotes } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { groupMembershipsByRole, isCurrentMembership, isMembershipPeriodUnknown } from "@/lib/membership";
import { getOrganizationSeoTier, shouldIndexOrganizationPage } from "@/lib/seo";
import { buildLocalizedUrl, buildPageMetadata } from "@/lib/site";

type OrganizationDetailPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
};

function formatOrganizationLabel(nameJa: string, shortName: string | null) {
  return shortName ? `${nameJa}（${shortName}）` : nameJa;
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
          teamCompetitionResults: true,
        },
      },
    },
  });

  if (!organization) {
    return {};
  }

  const organizationLabels = [organization.nameJa, organization.shortName ?? ""].filter(Boolean);
  const primaryLabel = formatOrganizationLabel(organization.nameJa, organization.shortName);
  const title = `${primaryLabel} | 所属選手・陸上長距離・駅伝成績`;
  const dictionary = getDictionary(locale);
  const description = [
    interpolate(dictionary.organizations.detailSeoIntro, {
      name: primaryLabel,
      type: formatOrganizationType(organization.type, locale),
    }),
    organization.shortName ? `${organization.shortName}名義で探されることがある組織です。` : null,
    organization._count.memberships > 0
      ? interpolate(dictionary.organizations.detailSeoMemberships, {
          count: organization._count.memberships,
        })
      : null,
    organization._count.teamCompetitionResults > 0
      ? `駅伝のチーム成績を${organization._count.teamCompetitionResults}件収録しています。`
      : null,
    organization.prefecture
      ? interpolate(dictionary.organizations.detailSeoLocation, {
          location: organization.prefecture ?? "",
        })
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const metadata = buildPageMetadata({
    title,
    description,
    path: `/organizations/${slug}`,
    locale,
    keywords: [
      ...organizationLabels,
      ...organizationLabels.map((name) => `${name} 駅伝`),
      ...organizationLabels.map((name) => `${name} 長距離`),
      ...organizationLabels.map((name) => `${name} 陸上部`),
      ...organizationLabels.map((name) => `${name} 所属選手`),
      formatOrganizationType(organization.type, locale),
      "所属人物",
      "駅伝チーム",
    ],
  });

  if (!shouldIndexOrganizationPage({
    slug,
    memberships: organization._count.memberships,
    raceResults: organization._count.raceResults,
    teamResults: organization._count.teamCompetitionResults,
  })) {
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
          { competitionEdition: { startsOn: "desc" } },
          { competitionEdition: { year: "desc" } },
          { competitionEdition: { editionNumber: "desc" } },
          { finalRank: "asc" },
        ],
      },
    },
  });

  if (!organization) {
    notFound();
  }

  const now = new Date();
  const unknownMemberships = organization.memberships.filter((membership) => isMembershipPeriodUnknown(membership));
  const currentMemberships = organization.memberships.filter(
    (membership) => !unknownMemberships.includes(membership) && isCurrentMembership(membership, now),
  );
  const formerMemberships = organization.memberships.filter(
    (membership) => !unknownMemberships.includes(membership) && !currentMemberships.includes(membership),
  );
  const currentByRole = groupMembershipsByRole(currentMemberships);
  const formerByRole = groupMembershipsByRole(formerMemberships);
  const unknownByRole = groupMembershipsByRole(unknownMemberships);
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
  const unknownMembershipSections = [
    { key: "athlete", label: formatMembershipRole("athlete", locale), items: unknownByRole.athlete },
    { key: "coach", label: formatMembershipRole("coach", locale), items: unknownByRole.coach },
    { key: "staff", label: formatMembershipRole("staff", locale), items: unknownByRole.staff },
  ];
  const highlightedEditions = ekidenResults.slice(0, 5).map((result) => result.competitionEdition.shortName ?? result.competitionEdition.officialName);
  const highlightedPeople = organization.memberships
    .slice(0, 8)
    .map((membership) => membership.person)
    .filter((person, index, list) => list.findIndex((entry) => entry.id === person.id) === index);
  const organizationSummary = [
    interpolate(dictionary.organizations.detailSummaryIntro, {
      name: organization.nameJa,
      type: formatOrganizationType(organization.type, locale),
    }),
    organization.memberships.length > 0
      ? interpolate(dictionary.organizations.detailSummaryMemberships, {
          count: organization.memberships.length,
        })
      : null,
    ekidenResults.length > 0
      ? interpolate(dictionary.organizations.detailSummaryTeamResults, {
          count: ekidenResults.length,
        })
      : null,
    highlightedEditions.length > 0
      ? interpolate(dictionary.organizations.detailSummaryCompetitions, {
          competitions: highlightedEditions.join("、"),
        })
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  const organizationStatItems = [
    { label: "在籍人物", value: organization.memberships.length },
    { label: "現役在籍", value: currentMemberships.length },
    { label: "駅伝成績", value: ekidenResults.length },
    { label: "注目大会", value: highlightedEditions.length },
  ];
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: organization.nameJa,
    alternateName: organization.shortName ?? undefined,
    description: organizationSummary,
    sport: "Ekiden",
    url: buildLocalizedUrl(locale, `/organizations/${organization.slug}`),
    location: organization.prefecture
      ? {
          "@type": "Place",
          name: organization.prefecture,
        }
      : undefined,
    sameAs: organization.websiteUrl ?? undefined,
    member: highlightedPeople.map((person) => ({
      "@type": "Person",
      name: person.displayNameJa,
      url: buildLocalizedUrl(locale, `/players/${person.slug}`),
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
        item: buildLocalizedUrl(locale),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: dictionary.organizations.listTitle,
        item: buildLocalizedUrl(locale, "/organizations"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: organization.nameJa,
        item: buildLocalizedUrl(locale, `/organizations/${organization.slug}`),
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
                  {organization.prefecture ?? dictionary.common.emptyDash}
                </p>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#59615c]">
                  {organizationSummary}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {organizationStatItems.map((item) => (
                    <div className="border border-[#e7e1d8] bg-[#fcfaf5] px-3 py-2" key={item.label}>
                      <dt className="text-xs uppercase tracking-[0.12em] text-[#8b938e]">{item.label}</dt>
                      <dd className="mt-1 text-lg font-semibold text-[#1f2421]">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex flex-col items-start gap-3">
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

          {unknownMemberships.length > 0 ? (
            <section className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.organizations.unknownPeriodPeople}</h2>
              <div className="mt-4 space-y-5">
                {unknownMembershipSections.map((section) =>
                  section.items.length > 0 ? (
                    <div key={section.key}>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8a1f2d]">{section.label}</h3>
                      <div className="mt-2 divide-y divide-[#e7e1d8]">
                        {section.items.map((membership) => (
                          <Link
                            className="grid gap-2 py-3 text-sm transition hover:text-[#8a1f2d] sm:grid-cols-[1fr_auto]"
                            data-analytics-event="player_profile_view"
                            data-analytics-link-type="organization_unknown_period_player"
                            href={`/${locale}/players/${membership.person.slug}`}
                            key={membership.id}
                          >
                            <span className="font-semibold">{membership.person.displayNameJa}</span>
                            <span className="text-[#59615c]">{dictionary.organizations.unknownPeriodLabel}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </section>
          ) : null}

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
