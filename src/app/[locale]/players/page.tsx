import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { DataStatus, OrganizationType, Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { CascadingOrganizationFilters } from "@/components/cascading-organization-filters";
import { prisma } from "@/lib/prisma";
import { formatDiscipline, formatOrganizationType, formatPersonType } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { JAPAN_PREFECTURES, isJapanPrefecture } from "@/lib/japan-prefectures";
import { buildLocalizedUrl, buildPageMetadata } from "@/lib/site";
import { getCurrentMembership, getHighSchoolMembership, getUniversityMembership } from "@/lib/membership";

type PlayersPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    q?: string;
    organizationType?: string;
    organization?: string;
    status?: string;
    hometown?: string;
    page?: string;
  }>;
};

export async function generateMetadata({ params, searchParams }: Pick<PlayersPageProps, "params" | "searchParams">): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const title = "駅伝選手・人物一覧 | 所属・大学・高校・PB検索";
  const description = "人物名から駅伝選手・関係人物を探せる一覧ページです。現在の所属、大学、高校、出身地、PB、大会成績の確認入口として使えます。";

  const metadata = buildPageMetadata({
    title,
    description,
    path: "/players",
    locale: localeParam,
    keywords: ["駅伝人物一覧", "駅伝選手一覧", "人物名検索", "駅伝人物検索", "所属検索", "大学検索", "高校検索", "PB検索"],
  });

  const queryParams = await searchParams;
  if (queryParams.q || queryParams.organizationType || queryParams.organization || queryParams.status || queryParams.hometown || queryParams.page) {
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

const allowedStatuses: DataStatus[] = ["verified", "pending", "conflicting", "missing"];
const pageSize = 10;
const maxPage = 100;
const allowedOrganizationTypes: OrganizationType[] = [
  "junior_high_school",
  "high_school",
  "university",
  "prefecture_representative",
  "student_union_select",
  "corporate_team",
  "club",
];

function normalizeJaSearchQuery(value: string) {
  return value.replace(/　/g, " ").replace(/\s+/g, "");
}

function buildPlayersPath(locale: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, String(value));
    }
  });

  const queryString = searchParams.toString();

  return `/${locale}/players${queryString ? `?${queryString}` : ""}`;
}

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const validPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  validPages.forEach((page, index) => {
    const previous = validPages[index - 1];

    if (previous && page - previous > 1) {
      items.push("ellipsis");
    }

    items.push(page);
  });

  return items;
}

export default async function PlayersPage({ params, searchParams }: PlayersPageProps) {
  const { locale: localeParam } = await params;
  const queryParams = await searchParams;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const query = queryParams.q?.trim() ?? "";
  const normalizedJaQuery = normalizeJaSearchQuery(query);
  const requestedOrganizationType = allowedOrganizationTypes.includes(queryParams.organizationType as OrganizationType)
    ? (queryParams.organizationType as OrganizationType)
    : "";
  const organizationSlug = queryParams.organization?.trim() ?? "";
  const selectedOrganization = organizationSlug
    ? await prisma.organization.findFirst({
        where: {
          slug: organizationSlug,
          memberships: {
            some: {},
          },
        },
      })
    : null;
  const organizationType = selectedOrganization?.type ?? requestedOrganizationType;
  const status = allowedStatuses.includes(queryParams.status as DataStatus)
    ? (queryParams.status as DataStatus)
    : "";
  const hometown = isJapanPrefecture(queryParams.hometown) ? queryParams.hometown : "";
  const requestedPage = Math.min(Number.parseInt(queryParams.page ?? "1", 10), maxPage);
  const hasActiveFilters = Boolean(query || organizationType || organizationSlug || status || hometown);
  const pagePathWithQuery = `/players${hasActiveFilters ? `?${new URLSearchParams(
    Object.entries({
      q: query,
      organizationType,
      organization: organizationSlug,
      status,
      hometown,
    }).filter(([, value]) => value),
  ).toString()}` : ""}`;

  const organizationOptions = await prisma.organization.findMany({
    where: {
      ...(organizationType ? { type: organizationType } : {}),
      memberships: {
        some: {},
      },
    },
    orderBy: [{ type: "asc" }, { nameJa: "asc" }],
  });

  const playerWhere: Prisma.PersonWhereInput = {
    ...(status ? { status } : {}),
    ...(hometown ? { hometown } : {}),
    ...(query
      ? {
          OR: [
            { displayNameJa: { contains: query, mode: "insensitive" } },
            ...(normalizedJaQuery
              ? [{ displayNameJaSearch: { contains: normalizedJaQuery, mode: "insensitive" as const } }]
              : []),
            { displayNameKana: { contains: query, mode: "insensitive" } },
            { displayNameRoman: { contains: query, mode: "insensitive" } },
            { displayNameZh: { contains: query, mode: "insensitive" } },
            { displayNameEn: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(organizationSlug || organizationType
      ? {
          memberships: {
            some: {
              organization: {
                ...(organizationSlug ? { slug: organizationSlug } : {}),
                ...(organizationType ? { type: organizationType } : {}),
              },
            },
          },
        }
      : {}),
  };

  const totalPlayers = await prisma.person.count({
    where: playerWhere,
  });
  const totalPages = Math.max(1, Math.ceil(totalPlayers / pageSize));
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
  const paginatedPlayers = await prisma.person.findMany({
    where: playerWhere,
    orderBy: [
      { updatedAt: "desc" },
      { displayNameJa: "asc" },
    ],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    include: {
      memberships: {
        include: {
          organization: true,
        },
        orderBy: [{ endDate: "desc" }, { startDate: "desc" }, { createdAt: "desc" }],
      },
      personalBests: {
        where: {
          discipline: {
            in: ["m5000", "m10000", "half_marathon"],
          },
        },
        orderBy: [{ discipline: "asc" }],
      },
    },
  });
  const paginationParams = {
    q: query,
    organizationType,
    organization: organizationSlug,
    status,
    hometown,
  };
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const playersListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "駅伝人物一覧",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: paginatedPlayers.length,
    itemListElement: paginatedPlayers.map((player, index) => ({
      "@type": "ListItem",
      position: (currentPage - 1) * pageSize + index + 1,
      url: buildLocalizedUrl(locale, `/players/${player.slug}`),
      name: player.displayNameJa,
    })),
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(playersListJsonLd) }}
      />
      <SiteHeader locale={locale} path={pagePathWithQuery} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="space-y-3">
            <div className="flex flex-col justify-between gap-4 border-b border-[#ded8cc] pb-6 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-3xl font-semibold">{dictionary.players.listTitle}</h1>
              </div>
              <p className="text-sm font-medium text-[#8a1f2d]">
                {interpolate(dictionary.players.resultCount, { count: totalPlayers })}
              </p>
            </div>
          </header>

          <form
            className="border border-[#ded8cc] bg-white p-4"
            action={`/${locale}/players`}
            data-analytics-event={hasActiveFilters ? "players_filter_apply" : "players_search_submit"}
            data-analytics-form="players_search"
          >
            <div className="grid gap-3 lg:grid-cols-[1.4fr_0.82fr_1.05fr_0.9fr_auto_auto]">
              <label className="filter-field">
                <span className="filter-label">{dictionary.common.search}</span>
                <div className="flex items-center gap-2 border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-[#8a1f2d]" aria-hidden="true" />
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[#8b938e]"
                    defaultValue={query}
                    name="q"
                    placeholder={dictionary.common.searchPlaceholder}
                    type="search"
                  />
                </div>
              </label>

              <CascadingOrganizationFilters
                allLabel={dictionary.common.all}
                organizationLabel={dictionary.players.organizationFilter}
                organizationOptions={organizationOptions.map((organization) => ({
                  id: organization.id,
                  label: organization.shortName ?? organization.nameJa,
                  slug: organization.slug,
                  type: organization.type,
                }))}
                organizationTypeLabel={dictionary.players.organizationTypeFilter}
                organizationTypes={allowedOrganizationTypes.map((type) => ({
                  label: formatOrganizationType(type, locale),
                  value: type,
                }))}
                selectedOrganization={organizationSlug}
                selectedOrganizationType={organizationType}
              />

              <label className="filter-field">
                <span className="filter-label">{dictionary.players.hometownFilter}</span>
                <select className="filter-input" defaultValue={hometown} name="hometown">
                  <option value="">{dictionary.common.all}</option>
                  {JAPAN_PREFECTURES.map((hometownOption) => (
                    <option key={hometownOption} value={hometownOption}>
                      {hometownOption}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="inline-flex items-center justify-center gap-2 self-end border border-[#8a1f2d] bg-[#8a1f2d] px-4 py-2 text-sm font-medium text-white"
                type="submit"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                {dictionary.common.filter}
              </button>

              <Link
                className="inline-flex items-center justify-center gap-2 self-end border border-[#cfc7b8] px-4 py-2 text-sm font-medium text-[#59615c] transition hover:text-[#8a1f2d]"
                href={`/${locale}/players`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {dictionary.common.reset}
              </Link>
            </div>
          </form>

          <section className="overflow-hidden border border-[#ded8cc] bg-white">
            <div className="hidden grid-cols-[1.1fr_1fr_1fr_1.2fr] border-b border-[#ded8cc] bg-[#f2eee7] px-4 py-3 text-sm font-semibold text-[#59615c] md:grid">
              <span>{dictionary.players.name}</span>
              <span>{dictionary.players.currentAffiliation}</span>
              <span>{dictionary.players.schoolHistory}</span>
              <span>{dictionary.players.personalBest}</span>
            </div>
            {totalPlayers > 0 ? (
              <div className="divide-y divide-[#e7e1d8]">
                {paginatedPlayers.map((player) => {
                  const currentMembership = getCurrentMembership(player.memberships);
                  const university = getUniversityMembership(player.memberships);
                  const highSchool = getHighSchoolMembership(player.memberships);
                  const pbSummary = player.personalBests
                    .filter((pb) => ["m5000", "m10000", "half_marathon"].includes(pb.discipline))
                    .map((pb) => `${formatDiscipline(pb.discipline, locale)} ${pb.mark}`)
                    .join(" / ");

                  return (
                    <Link
                      className="grid gap-3 px-4 py-4 transition hover:bg-[#fbfaf7] md:grid-cols-[1.1fr_1fr_1fr_1.2fr]"
                      href={`/${locale}/players/${player.slug}`}
                      key={player.id}
                      data-analytics-event="player_profile_view"
                      data-analytics-link-type="players_list"
                    >
                      <span>
                        <strong className="block font-semibold">{player.displayNameJa}</strong>
                        <span className="text-sm text-[#59615c]">{player.displayNameRoman}</span>
                        <span className="mt-1 inline-flex border border-[#ded8cc] px-2 py-0.5 text-xs text-[#8a1f2d]">
                          {formatPersonType(player.type, locale)}
                        </span>
                      </span>
                      <span>
                        <span className="mb-1 block text-xs font-medium text-[#8b938e] md:hidden">
                          {dictionary.players.currentAffiliation}
                        </span>
                        {currentMembership?.organization.nameJa ?? dictionary.common.emptyDash}
                      </span>
                      <span className="text-sm text-[#59615c]">
                        <span className="mb-1 block text-xs font-medium text-[#8b938e] md:hidden">
                          {dictionary.players.schoolHistory}
                        </span>
                        <span className="block">{university?.organization.nameJa ?? dictionary.common.emptyDash}</span>
                        <span className="block">{highSchool?.organization.nameJa ?? dictionary.common.emptyDash}</span>
                      </span>
                      <span className="text-sm text-[#59615c]">
                        <span className="mb-1 block text-xs font-medium text-[#8b938e] md:hidden">
                          {dictionary.players.personalBest}
                        </span>
                        {pbSummary || dictionary.common.emptyDash}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-10 text-center">
                <h2 className="text-lg font-semibold">{dictionary.players.emptyTitle}</h2>
                <p className="mt-2 text-sm text-[#59615c]">{dictionary.players.emptyDescription}</p>
                <p className="mt-2 text-sm text-[#59615c]">{dictionary.common.noResultsHint}</p>
                <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    className="inline-flex items-center justify-center gap-2 border border-[#8a1f2d] bg-[#8a1f2d] px-4 py-2 text-sm font-medium text-white"
                    href={`/${locale}/players`}
                  >
                    {dictionary.common.reset}
                  </Link>
                </div>
              </div>
            )}
          </section>

          {totalPlayers > pageSize ? (
            <nav className="flex flex-col items-center justify-between gap-3 border-t border-[#ded8cc] pt-4 sm:flex-row">
              <p className="text-sm text-[#59615c]">
                {interpolate(dictionary.players.pageSummary, {
                  current: currentPage,
                  total: totalPages,
                })}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  aria-disabled={currentPage <= 1}
                  className={`inline-flex items-center gap-1 border px-3 py-2 text-sm font-medium ${
                    currentPage <= 1
                      ? "pointer-events-none border-[#e7e1d8] text-[#b8b0a5]"
                      : "border-[#cfc7b8] text-[#8a1f2d] hover:border-[#8a1f2d]"
                  }`}
                  href={buildPlayersPath(locale, { ...paginationParams, page: currentPage - 1 })}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {dictionary.players.previousPage}
                </Link>
                <div className="flex flex-wrap items-center justify-center gap-1">
                  {paginationItems.map((item, index) =>
                    item === "ellipsis" ? (
                      <span className="px-2 py-2 text-sm text-[#8b938e]" key={`ellipsis-${index}`}>
                        ...
                      </span>
                    ) : (
                      <Link
                        aria-current={item === currentPage ? "page" : undefined}
                        className={`inline-flex h-9 min-w-9 items-center justify-center border px-3 text-sm font-medium ${
                          item === currentPage
                            ? "border-[#8a1f2d] bg-[#8a1f2d] text-white"
                            : "border-[#cfc7b8] text-[#8a1f2d] hover:border-[#8a1f2d]"
                        }`}
                        href={buildPlayersPath(locale, { ...paginationParams, page: item })}
                        key={item}
                      >
                        {item}
                      </Link>
                    ),
                  )}
                </div>
                <Link
                  aria-disabled={currentPage >= totalPages}
                  className={`inline-flex items-center gap-1 border px-3 py-2 text-sm font-medium ${
                    currentPage >= totalPages
                      ? "pointer-events-none border-[#e7e1d8] text-[#b8b0a5]"
                      : "border-[#cfc7b8] text-[#8a1f2d] hover:border-[#8a1f2d]"
                  }`}
                  href={buildPlayersPath(locale, { ...paginationParams, page: currentPage + 1 })}
                >
                  {dictionary.players.nextPage}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </nav>
          ) : null}
        </div>
      </main>
    </div>
  );
}
