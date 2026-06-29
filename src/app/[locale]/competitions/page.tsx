import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";

type CompetitionsPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

const pageSize = 10;

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase();
}

function includesNormalized(value: string | null | undefined, query: string) {
  return normalizeSearchText(value).includes(query);
}

function buildCompetitionsPath(locale: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, String(value));
    }
  });

  const queryString = searchParams.toString();

  return `/${locale}/competitions${queryString ? `?${queryString}` : ""}`;
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

export default async function CompetitionsPage({ params, searchParams }: CompetitionsPageProps) {
  const { locale: localeParam } = await params;
  const queryParams = await searchParams;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const query = queryParams.q?.trim() ?? "";
  const normalizedQuery = normalizeSearchText(query);
  const requestedPage = Number.parseInt(queryParams.page ?? "1", 10);
  const editions = await prisma.competitionEdition.findMany({
    include: {
      competition: true,
      races: {
        include: {
          _count: {
            select: { raceResults: true },
          },
        },
      },
    },
    orderBy: [{ year: "desc" }, { startsOn: "desc" }, { officialName: "asc" }],
  });
  const filteredEditions = normalizedQuery
    ? editions.filter((edition) =>
        [
          edition.officialName,
          edition.shortName,
          edition.competition.nameJa,
          edition.competition.nameZh,
          edition.competition.nameEn,
          edition.year?.toString(),
        ].some((value) => includesNormalized(value, normalizedQuery)),
      )
    : editions;
  const totalPages = Math.max(1, Math.ceil(filteredEditions.length / pageSize));
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
  const paginatedEditions = filteredEditions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginationItems = getPaginationItems(currentPage, totalPages);

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path={buildCompetitionsPath(locale, { q: query })} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="flex flex-col justify-between gap-4 border-b border-[#ded8cc] pb-6 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold">{dictionary.competitions.listTitle}</h1>
              <p className="mt-2 text-sm text-[#59615c]">{dictionary.competitions.listDescription}</p>
            </div>
            <p className="text-sm font-medium text-[#8a1f2d]">
              {interpolate(dictionary.competitions.resultCount, { count: filteredEditions.length })}
            </p>
          </header>

          <form action={`/${locale}/competitions`} className="border border-[#ded8cc] bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="flex items-center gap-2 border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-[#8a1f2d]" aria-hidden="true" />
                <span className="sr-only">{dictionary.common.search}</span>
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#8b938e]"
                  defaultValue={query}
                  name="q"
                  placeholder={dictionary.competitions.searchPlaceholder}
                  type="search"
                />
              </label>

              <button
                className="inline-flex items-center justify-center gap-2 border border-[#8a1f2d] bg-[#8a1f2d] px-4 py-2 text-sm font-medium text-white"
                type="submit"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                {dictionary.common.filter}
              </button>

              <Link
                className="inline-flex items-center justify-center gap-2 border border-[#cfc7b8] px-4 py-2 text-sm font-medium text-[#59615c] transition hover:text-[#8a1f2d]"
                href={`/${locale}/competitions`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {dictionary.common.reset}
              </Link>
            </div>
          </form>

          <div className="divide-y divide-[#e7e1d8] border-y border-[#ded8cc] bg-white">
            {paginatedEditions.length > 0 ? paginatedEditions.map((edition) => {
              const resultCount = edition.races.reduce((sum, race) => sum + race._count.raceResults, 0);

              return (
                <Link
                  className="grid gap-3 px-4 py-5 transition hover:bg-[#fbfaf7] md:grid-cols-[1.3fr_0.7fr_0.7fr_auto]"
                  href={`/${locale}/competitions/${edition.slug}`}
                  key={edition.id}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a1f2d]">
                      {edition.competition.nameJa}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">{edition.shortName ?? edition.officialName}</h2>
                  </div>
                  <div className="text-sm text-[#59615c]">
                    <p className="text-xs font-medium text-[#8b938e]">{dictionary.competitions.date}</p>
                    <p className="mt-1">{formatDate(edition.startsOn) || dictionary.common.emptyDash}</p>
                  </div>
                  <div className="text-sm text-[#59615c]">
                    <p className="text-xs font-medium text-[#8b938e]">{dictionary.competitions.resultCountLabel}</p>
                    <p className="mt-1">{resultCount}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 self-center text-sm font-medium text-[#8a1f2d]">
                    {dictionary.competitions.results}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              );
            }) : (
              <div className="px-4 py-10 text-center">
                <h2 className="text-lg font-semibold">{dictionary.competitions.emptyTitle}</h2>
                <p className="mt-2 text-sm text-[#59615c]">{dictionary.competitions.emptyDescription}</p>
              </div>
            )}
          </div>

          {filteredEditions.length > pageSize ? (
            <nav className="flex flex-col items-center justify-between gap-3 border-t border-[#ded8cc] pt-4 sm:flex-row">
              <p className="text-sm text-[#59615c]">
                {interpolate(dictionary.competitions.pageSummary, {
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
                  href={buildCompetitionsPath(locale, { q: query, page: currentPage - 1 })}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {dictionary.competitions.previousPage}
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
                        href={buildCompetitionsPath(locale, { q: query, page: item })}
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
                  href={buildCompetitionsPath(locale, { q: query, page: currentPage + 1 })}
                >
                  {dictionary.competitions.nextPage}
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
