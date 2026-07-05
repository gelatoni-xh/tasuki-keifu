import type { Metadata } from "next";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getDictionary, isLocale } from "@/lib/i18n";
import { buildOrganizationJsonLd, buildPageMetadata, buildWebsiteJsonLd } from "@/lib/site";

type HomePageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const title = "駅伝人物・所属・出身校データベース";
  const description = "駅伝の人物を名前、所属、出身校から探せる人物検索入口です。PBやレース記録の確認にも使えます。";

  return buildPageMetadata({
    title,
    description,
    path: "",
    locale: localeParam,
    keywords: ["駅伝人物検索", "駅伝選手検索", "所属検索", "出身校検索"],
  });
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const websiteJsonLd = locale === "ja" ? buildWebsiteJsonLd() : null;
  const organizationJsonLd = locale === "ja" ? buildOrganizationJsonLd() : null;
  const quickLinks = [
    {
      title: dictionary.home.quickLinks.players.title,
      description: dictionary.home.quickLinks.players.description,
      href: `/${locale}/players`,
    },
    {
      title: dictionary.home.quickLinks.competitions.title,
      description: dictionary.home.quickLinks.competitions.description,
      href: `/${locale}/competitions`,
    },
    {
      title: dictionary.home.quickLinks.organizations.title,
      description: dictionary.home.quickLinks.organizations.description,
      href: `/${locale}/organizations`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      {websiteJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      ) : null}
      {organizationJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      ) : null}
      <SiteHeader locale={locale} path="" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5 sm:py-12 lg:py-20">
        <section className="space-y-8 sm:space-y-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8a1f2d]">{dictionary.site.label}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">{dictionary.site.name}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#59615c]">{dictionary.site.shortDescription}</p>
          </div>

          <form
            className="flex flex-col gap-3 border border-[#cfc7b8] bg-white p-4 shadow-sm sm:flex-row sm:items-center"
            action={`/${locale}/players`}
            data-analytics-event="home_search_submit"
            data-analytics-form="home_search"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Search className="h-5 w-5 shrink-0 text-[#8a1f2d]" aria-hidden="true" />
              <input
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#8f978f]"
                name="q"
                placeholder={dictionary.common.homeSearchPlaceholder}
                aria-label={dictionary.common.search}
                type="search"
              />
            </div>
            <button
              className="inline-flex w-full items-center justify-center gap-2 bg-[#1f3b33] px-5 py-3 text-sm font-medium text-white sm:w-auto"
              type="submit"
            >
              {dictionary.common.search}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{dictionary.home.browseTitle}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quickLinks.map((link) => (
                <Link
                  className="group flex h-full flex-col justify-between border border-[#ded8cc] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#cfc7b8] hover:bg-[#fffdf9]"
                  href={link.href}
                  key={link.title}
                >
                  <div>
                    <p className="text-lg font-semibold">{link.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#59615c]">{link.description}</p>
                  </div>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#1f3b33]">
                    {dictionary.home.openDirectory}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
