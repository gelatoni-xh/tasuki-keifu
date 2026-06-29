import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getDictionary, isLocale } from "@/lib/i18n";

type HomePageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const confirmedEntries = [
    {
      title: "第102回箱根駅伝",
      scope: dictionary.home.confirmedEntryType.competition,
      detail: dictionary.home.confirmedDetails.hakone102,
      href: `/${locale}/competitions/hakone-ekiden-102`,
    },
    {
      title: "第101回箱根駅伝",
      scope: dictionary.home.confirmedEntryType.competition,
      detail: dictionary.home.confirmedDetails.hakone101,
      href: `/${locale}/competitions/hakone-ekiden-101`,
    },
    {
      title: "黒田 朝日",
      scope: dictionary.home.confirmedEntryType.player,
      detail: dictionary.home.confirmedDetails.asahiKuroda,
      href: `/${locale}/players/asahi-kuroda`,
    },
  ];
  const updateQueue = [
    {
      title: "第100回箱根駅伝",
      scope: dictionary.home.updateScope.competition,
      status: dictionary.home.updateStatus.pending,
      detail: dictionary.home.updateDetails.hakone100,
      href: `/${locale}/competitions`,
    },
    {
      title: "第99回箱根駅伝",
      scope: dictionary.home.updateScope.competition,
      status: dictionary.home.updateStatus.pending,
      detail: dictionary.home.updateDetails.hakone99,
      href: `/${locale}/competitions`,
    },
    {
      title: "第98回箱根駅伝",
      scope: dictionary.home.updateScope.competition,
      status: dictionary.home.updateStatus.pending,
      detail: dictionary.home.updateDetails.hakone98,
      href: `/${locale}/competitions`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path="" />

      <main className="mx-auto max-w-6xl px-5 py-12 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
          <section className="space-y-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8a1f2d]">{dictionary.site.label}</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">{dictionary.site.name}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#59615c]">{dictionary.site.shortDescription}</p>
            </div>

            <form
              className="flex max-w-2xl items-center gap-3 border border-[#cfc7b8] bg-white px-4 py-3 shadow-sm"
              action={`/${locale}/players`}
            >
              <Search className="h-5 w-5 text-[#8a1f2d]" aria-hidden="true" />
              <input
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#8f978f]"
                name="q"
                placeholder={dictionary.common.searchPlaceholder}
                aria-label={dictionary.common.search}
              />
              <button
                className="inline-flex items-center gap-2 bg-[#1f3b33] px-4 py-2 text-sm font-medium text-white"
                type="submit"
              >
                {dictionary.common.search}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>

            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-2 border border-[#1f3b33] bg-[#1f3b33] px-4 py-2 text-sm font-medium text-white"
                href={`/${locale}/players`}
              >
                {dictionary.home.viewPlayers}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                className="inline-flex items-center gap-2 border border-[#ded8cc] bg-white px-4 py-2 text-sm font-medium text-[#8a1f2d]"
                href={`/${locale}/players/asahi-kuroda`}
              >
                黒田 朝日
              </Link>
            </div>

            {confirmedEntries.length > 0 ? (
              <section className="border-t border-[#ded8cc] pt-8">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold">{dictionary.home.confirmedData}</h2>
                </div>
                <div className="mt-4 divide-y divide-[#e7e1d8] border-y border-[#e7e1d8]">
                  {confirmedEntries.map((entry) => (
                    <Link
                      className="grid gap-2 py-4 text-sm transition hover:bg-white sm:grid-cols-[1fr_1fr_auto]"
                      href={entry.href}
                      key={entry.title}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <span>{entry.title}</span>
                        <span className="text-xs font-medium text-[#8b938e]">{entry.scope}</span>
                      </span>
                      <span className="text-[#59615c]">{entry.detail}</span>
                      <span className="inline-flex items-center gap-1 text-[#8a1f2d]">
                        {dictionary.home.openEntry}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </section>

          <aside className="border border-[#ded8cc] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#e7e1d8] pb-4">
              <h2 className="text-lg font-semibold">{dictionary.home.updateQueue}</h2>
              <span className="text-xs text-[#59615c]">{dictionary.home.updateQueueTag}</span>
            </div>
            <div className="divide-y divide-[#e7e1d8]">
              {updateQueue.map((item) => (
                <Link className="block py-4 transition hover:bg-[#fbfaf7]" href={item.href} key={item.title}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[#59615c]">{item.detail}</p>
                      <p className="mt-2 text-xs text-[#8b938e]">{item.scope}</p>
                    </div>
                    <span className="shrink-0 border border-[#ded8cc] px-2 py-1 text-xs text-[#8a1f2d]">
                      {item.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
