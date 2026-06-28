import Link from "next/link";
import { notFound } from "next/navigation";
import type { DataStatus, OrganizationType, Prisma } from "@prisma/client";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatDiscipline, formatOrganizationType, formatStatus } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import {
  getCurrentMembership,
  getHighSchoolMembership,
  getUniversityMembership,
} from "@/lib/membership";

type PlayersPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    q?: string;
    organizationType?: string;
    organization?: string;
    status?: string;
  }>;
};

const allowedStatuses: DataStatus[] = ["verified", "pending", "conflicting", "missing"];
const allowedOrganizationTypes: OrganizationType[] = [
  "junior_high_school",
  "high_school",
  "university",
  "corporate_team",
  "company",
  "club",
  "federation",
  "organizer",
];

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase();
}

function includesNormalized(value: string | null | undefined, query: string) {
  return normalizeSearchText(value).includes(query);
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
  const normalizedQuery = normalizeSearchText(query);
  const organizationType = allowedOrganizationTypes.includes(queryParams.organizationType as OrganizationType)
    ? (queryParams.organizationType as OrganizationType)
    : "";
  const organizationSlug = queryParams.organization?.trim() ?? "";
  const status = allowedStatuses.includes(queryParams.status as DataStatus)
    ? (queryParams.status as DataStatus)
    : "";
  const hasActiveFilters = Boolean(query || organizationType || organizationSlug || status);
  const pagePathWithQuery = `/players${hasActiveFilters ? `?${new URLSearchParams(
    Object.entries({
      q: query,
      organizationType,
      organization: organizationSlug,
      status,
    }).filter(([, value]) => value),
  ).toString()}` : ""}`;

  const organizationOptions = await prisma.organization.findMany({
    where: {
      ...(organizationType ? { type: organizationType } : {}),
      memberships: {
        some: {
          person: { type: "athlete" },
        },
      },
    },
    orderBy: [{ type: "asc" }, { nameJa: "asc" }],
  });

  const playerWhere: Prisma.PersonWhereInput = {
    type: "athlete",
    ...(status ? { status } : {}),
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

  const players = await prisma.person.findMany({
    where: playerWhere,
    orderBy: { displayNameJa: "asc" },
    include: {
      memberships: {
        include: { organization: true },
        orderBy: { type: "asc" },
      },
      personalBests: {
        orderBy: { discipline: "asc" },
      },
    },
  });
  const filteredPlayers = normalizedQuery
    ? players.filter((player) => {
        const personMatched = [
          player.displayNameJa,
          player.displayNameKana,
          player.displayNameRoman,
          player.displayNameZh,
          player.displayNameEn,
        ].some((value) => includesNormalized(value, normalizedQuery));
        const organizationMatched = player.memberships.some((membership) =>
          [
            membership.organization.nameJa,
            membership.organization.nameKana,
            membership.organization.nameRoman,
            membership.organization.nameZh,
            membership.organization.nameEn,
            membership.organization.shortName,
          ].some((value) => includesNormalized(value, normalizedQuery)),
        );

        return personMatched || organizationMatched;
      })
    : players;

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path={pagePathWithQuery} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="space-y-3">
            <div className="flex flex-col justify-between gap-4 border-b border-[#ded8cc] pb-6 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-3xl font-semibold">{dictionary.players.listTitle}</h1>
                <p className="mt-2 text-sm text-[#59615c]">{dictionary.players.listDescription}</p>
              </div>
              <p className="text-sm font-medium text-[#8a1f2d]">
                {interpolate(dictionary.players.resultCount, { count: filteredPlayers.length })}
              </p>
            </div>
          </header>

          <form className="border border-[#ded8cc] bg-white p-4" action={`/${locale}/players`}>
            <div className="grid gap-3 lg:grid-cols-[1.35fr_0.8fr_0.95fr_0.75fr_auto_auto]">
              <label className="flex items-center gap-2 border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-[#8a1f2d]" aria-hidden="true" />
                <span className="sr-only">{dictionary.common.search}</span>
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#8b938e]"
                  defaultValue={query}
                  name="q"
                  placeholder={dictionary.common.searchPlaceholder}
                  type="search"
                />
              </label>

              <label className="flex items-center gap-2 border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
                <SlidersHorizontal className="h-4 w-4 shrink-0 text-[#8a1f2d]" aria-hidden="true" />
                <span className="sr-only">{dictionary.players.organizationTypeFilter}</span>
                <select
                  className="w-full bg-transparent text-sm outline-none"
                  defaultValue={organizationType}
                  name="organizationType"
                >
                  <option value="">{dictionary.common.all}</option>
                  {allowedOrganizationTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatOrganizationType(type, locale)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
                <span className="sr-only">{dictionary.players.organizationFilter}</span>
                <select
                  className="w-full bg-transparent text-sm outline-none"
                  defaultValue={organizationSlug}
                  name="organization"
                >
                  <option value="">{dictionary.common.all}</option>
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.slug}>
                      {organization.shortName ?? organization.nameJa}
                    </option>
                  ))}
                </select>
              </label>

              <label className="border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
                <span className="sr-only">{dictionary.players.statusFilter}</span>
                <select className="w-full bg-transparent text-sm outline-none" defaultValue={status} name="status">
                  <option value="">{dictionary.common.all}</option>
                  {allowedStatuses.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {formatStatus(statusOption, locale)}
                    </option>
                  ))}
                </select>
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
                href={`/${locale}/players`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {dictionary.common.reset}
              </Link>
            </div>
          </form>

          <section className="overflow-hidden border border-[#ded8cc] bg-white">
            <div className="hidden grid-cols-[1.1fr_1fr_1fr_1.2fr_0.7fr] border-b border-[#ded8cc] bg-[#f2eee7] px-4 py-3 text-sm font-semibold text-[#59615c] md:grid">
              <span>{dictionary.players.name}</span>
              <span>{dictionary.players.currentAffiliation}</span>
              <span>{dictionary.players.schoolHistory}</span>
              <span>{dictionary.players.personalBest}</span>
              <span>{dictionary.players.status}</span>
            </div>
            {filteredPlayers.length > 0 ? (
              <div className="divide-y divide-[#e7e1d8]">
                {filteredPlayers.map((player) => {
                  const currentMembership = getCurrentMembership(player.memberships);
                  const university = getUniversityMembership(player.memberships);
                  const highSchool = getHighSchoolMembership(player.memberships);
                  const pbSummary = player.personalBests
                    .filter((pb) => ["m5000", "m10000", "half_marathon"].includes(pb.discipline))
                    .map((pb) => `${formatDiscipline(pb.discipline, locale)} ${pb.mark}`)
                    .join(" / ");

                  return (
                    <Link
                      className="grid gap-3 px-4 py-4 transition hover:bg-[#fbfaf7] md:grid-cols-[1.1fr_1fr_1fr_1.2fr_0.7fr]"
                      href={`/${locale}/players/${player.slug}`}
                      key={player.id}
                    >
                      <span>
                        <strong className="block font-semibold">{player.displayNameJa}</strong>
                        <span className="text-sm text-[#59615c]">{player.displayNameRoman}</span>
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
                      <span className="text-sm text-[#8a1f2d]">
                        <span className="mb-1 block text-xs font-medium text-[#8b938e] md:hidden">
                          {dictionary.players.status}
                        </span>
                        {formatStatus(player.status, locale)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-10 text-center">
                <h2 className="text-lg font-semibold">{dictionary.players.emptyTitle}</h2>
                <p className="mt-2 text-sm text-[#59615c]">{dictionary.players.emptyDescription}</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
