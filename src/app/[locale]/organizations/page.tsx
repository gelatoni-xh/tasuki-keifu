import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { DataStatus, OrganizationType } from "@prisma/client";
import { ArrowRight, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatOrganizationType } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { JAPAN_PREFECTURES, isJapanPrefecture } from "@/lib/japan-prefectures";
import { buildPageMetadata } from "@/lib/site";

type OrganizationsPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    prefecture?: string;
    page?: string;
  }>;
};

export async function generateMetadata({ params }: Pick<OrganizationsPageProps, "params">): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const title = "学校・実業団・連盟一覧";
  const description = "学校、大学、実業団、連盟などの組織一覧ページです。所属選手や関連データを探す入口として使えます。";

  return buildPageMetadata({
    title,
    description,
    path: "/organizations",
    locale: localeParam,
    keywords: ["大学駅伝学校一覧", "実業団一覧", "連盟一覧"],
  });
}

const allowedOrganizationTypes: OrganizationType[] = [
  "junior_high_school",
  "high_school",
  "university",
  "prefecture_representative",
  "student_union_select",
  "corporate_team",
  "club",
];
const allowedStatuses: DataStatus[] = ["verified", "pending", "conflicting", "missing"];
const pageSize = 10;

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase();
}

function includesNormalized(value: string | null | undefined, query: string) {
  return normalizeSearchText(value).includes(query);
}

function getStatusPriority(status: DataStatus) {
  switch (status) {
    case "verified":
      return 0;
    case "pending":
      return 1;
    case "conflicting":
      return 2;
    case "missing":
    default:
      return 3;
  }
}

function buildOrganizationsPath(locale: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, String(value));
    }
  });

  const queryString = searchParams.toString();

  return `/${locale}/organizations${queryString ? `?${queryString}` : ""}`;
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

export default async function OrganizationsPage({ params, searchParams }: OrganizationsPageProps) {
  const { locale: localeParam } = await params;
  const queryParams = await searchParams;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const query = queryParams.q?.trim() ?? "";
  const normalizedQuery = normalizeSearchText(query);
  const organizationType = allowedOrganizationTypes.includes(queryParams.type as OrganizationType)
    ? (queryParams.type as OrganizationType)
    : "university";
  const status = allowedStatuses.includes(queryParams.status as DataStatus)
    ? (queryParams.status as DataStatus)
    : "";
  const prefecture = isJapanPrefecture(queryParams.prefecture) ? queryParams.prefecture : "";
  const requestedPage = Number.parseInt(queryParams.page ?? "1", 10);
  const organizations = await prisma.organization.findMany({
    where: {
      type: organizationType,
      ...(status ? { status } : {}),
      ...(prefecture ? { prefecture } : {}),
    },
    include: {
      _count: {
        select: { memberships: true, raceResults: true, teamCompetitionResults: true },
      },
    },
  });
  const filteredOrganizations = normalizedQuery
    ? organizations.filter((organization) =>
        [
          organization.nameJa,
          organization.nameKana,
          organization.nameRoman,
          organization.nameZh,
          organization.nameEn,
          organization.shortName,
          organization.location,
          organization.prefecture,
        ].some((value) => includesNormalized(value, normalizedQuery)),
      )
    : organizations;
  filteredOrganizations.sort((left, right) => {
    const statusDelta = getStatusPriority(left.status) - getStatusPriority(right.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const membershipDelta = right._count.memberships - left._count.memberships;
    if (membershipDelta !== 0) {
      return membershipDelta;
    }

    const teamResultDelta = right._count.teamCompetitionResults - left._count.teamCompetitionResults;
    if (teamResultDelta !== 0) {
      return teamResultDelta;
    }

    const raceResultDelta = right._count.raceResults - left._count.raceResults;
    if (raceResultDelta !== 0) {
      return raceResultDelta;
    }

    const updatedAtDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    return left.nameJa.localeCompare(right.nameJa, "ja");
  });
  const totalPages = Math.max(1, Math.ceil(filteredOrganizations.length / pageSize));
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
  const paginatedOrganizations = filteredOrganizations.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginationItems = getPaginationItems(currentPage, totalPages);

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader
        locale={locale}
        path={buildOrganizationsPath(locale, { q: query, type: organizationType, status, prefecture })}
      />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="flex flex-col justify-between gap-4 border-b border-[#ded8cc] pb-6 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold">{dictionary.organizations.listTitle}</h1>
              <p className="mt-2 text-sm text-[#59615c]">{dictionary.organizations.listDescription}</p>
            </div>
            <p className="text-sm font-medium text-[#8a1f2d]">
              {interpolate(dictionary.organizations.resultCount, { count: filteredOrganizations.length })}
            </p>
          </header>

          <form action={`/${locale}/organizations`} className="border border-[#ded8cc] bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr_0.75fr_0.85fr_auto_auto]">
              <label className="filter-field">
                <span className="filter-label">{dictionary.common.search}</span>
                <div className="flex items-center gap-2 border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-[#8a1f2d]" aria-hidden="true" />
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[#8b938e]"
                    defaultValue={query}
                    name="q"
                    placeholder={dictionary.organizations.searchPlaceholder}
                    type="search"
                  />
                </div>
              </label>

              <label className="filter-field">
                <span className="filter-label">{dictionary.organizations.type}</span>
                <select className="filter-input" defaultValue={organizationType} name="type">
                  {allowedOrganizationTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatOrganizationType(type, locale)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter-field">
                <span className="filter-label">{dictionary.organizations.prefectureFilter}</span>
                <select className="filter-input" defaultValue={prefecture} name="prefecture">
                  <option value="">{dictionary.common.all}</option>
                  {JAPAN_PREFECTURES.map((prefectureOption) => (
                    <option key={prefectureOption} value={prefectureOption}>
                      {prefectureOption}
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
                href={`/${locale}/organizations?type=university`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {dictionary.common.reset}
              </Link>
            </div>
          </form>

          <div className="divide-y divide-[#e7e1d8] border-y border-[#ded8cc] bg-white">
            {paginatedOrganizations.length > 0 ? paginatedOrganizations.map((organization) => (
              <Link
                className="grid gap-3 px-4 py-5 transition hover:bg-[#fbfaf7] md:grid-cols-[1.3fr_0.8fr_0.7fr_auto]"
                href={`/${locale}/organizations/${organization.slug}`}
                key={organization.id}
              >
                <div>
                  <h2 className="text-xl font-semibold">{organization.nameJa}</h2>
                  <p className="mt-2 text-sm text-[#59615c]">{organization.prefecture ?? dictionary.common.emptyDash}</p>
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
            )) : (
              <div className="px-4 py-10 text-center">
                <h2 className="text-lg font-semibold">{dictionary.organizations.emptyTitle}</h2>
                <p className="mt-2 text-sm text-[#59615c]">{dictionary.organizations.emptyDescription}</p>
              </div>
            )}
          </div>

          {filteredOrganizations.length > pageSize ? (
            <nav className="flex flex-col items-center justify-between gap-3 border-t border-[#ded8cc] pt-4 sm:flex-row">
              <p className="text-sm text-[#59615c]">
                {interpolate(dictionary.organizations.pageSummary, {
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
                  href={buildOrganizationsPath(locale, {
                    q: query,
                    type: organizationType,
                    status,
                    prefecture,
                    page: currentPage - 1,
                  })}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {dictionary.organizations.previousPage}
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
                        href={buildOrganizationsPath(locale, {
                          q: query,
                          type: organizationType,
                          status,
                          prefecture,
                          page: item,
                        })}
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
                  href={buildOrganizationsPath(locale, {
                    q: query,
                    type: organizationType,
                    status,
                    prefecture,
                    page: currentPage + 1,
                  })}
                >
                  {dictionary.organizations.nextPage}
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
