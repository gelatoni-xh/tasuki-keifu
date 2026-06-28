import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";

type CompetitionsPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function CompetitionsPage({ params }: CompetitionsPageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
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

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path="/competitions" />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="flex flex-col justify-between gap-4 border-b border-[#ded8cc] pb-6 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold">{dictionary.competitions.listTitle}</h1>
              <p className="mt-2 text-sm text-[#59615c]">{dictionary.competitions.listDescription}</p>
            </div>
            <p className="text-sm font-medium text-[#8a1f2d]">
              {interpolate(dictionary.competitions.resultCount, { count: editions.length })}
            </p>
          </header>

          <div className="divide-y divide-[#e7e1d8] border-y border-[#ded8cc] bg-white">
            {editions.map((edition) => {
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
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
