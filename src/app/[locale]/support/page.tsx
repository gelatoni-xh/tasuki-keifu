import type { Metadata } from "next";
import { CircleAlert, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { isLocale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/site";
import { getStaticPageCopy } from "@/lib/static-pages";

type SupportPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({ params }: SupportPageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const copy = getStaticPageCopy(localeParam);

  return buildPageMetadata({
    title: copy.support.title,
    description: copy.support.intro,
    path: "/support",
    locale: localeParam,
    keywords: ["駅伝サイト支援", "PayPal", "Tasuki Keifu"],
  });
}

export default async function SupportPage({ params }: SupportPageProps) {
  const { locale: localeParam } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const copy = getStaticPageCopy(locale);
  const paypalUrl = process.env.NEXT_PUBLIC_SUPPORT_PAYPAL_URL;

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path="/support" />

      <main className="mx-auto max-w-4xl px-5 py-12 lg:py-20">
        <section className="space-y-6 border border-[#d8cfbf] bg-[linear-gradient(180deg,#fffdf9_0%,#f7f2e9_100%)] p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8a1f2d]">{copy.support.projectEyebrow}</p>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold sm:text-4xl">{copy.support.projectTitle}</h1>
            <p className="max-w-3xl text-base leading-8 text-[#59615c]">{copy.support.projectIntro}</p>
          </div>
        </section>

        <section className="mt-8 grid gap-5">
          {copy.support.projectSections.map((section) => (
            <article key={section.title} className="border border-[#ded8cc] bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-[#59615c] sm:text-base">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-8 space-y-6 border border-[#cfc7b8] bg-[linear-gradient(180deg,#fffdf9_0%,#f8f3e8_100%)] p-6 shadow-sm sm:p-8">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8a1f2d]">{copy.support.supportEyebrow}</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">{copy.support.supportTitle}</h2>
            <p className="max-w-3xl text-base leading-8 text-[#59615c]">{copy.support.supportIntro}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="border border-[#ded8cc] bg-white p-5 shadow-sm">
              <p className="text-sm font-medium leading-7 text-[#59615c]">{copy.support.note}</p>
            </div>

            {paypalUrl ? (
              <a
                className="inline-flex min-h-32 flex-col justify-between border border-[#1f3b33] bg-[#1f3b33] p-5 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#204438]"
                href={paypalUrl}
                rel="noreferrer"
                target="_blank"
                data-analytics-event="support_paypal_click"
                data-analytics-link-type="support_primary_cta"
                data-analytics-placement="hero"
              >
                <span className="text-sm uppercase tracking-[0.18em] text-[#d8e4df]">PayPal</span>
                <span className="inline-flex items-center gap-2 text-lg font-semibold">
                  {copy.support.primaryCta}
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </span>
              </a>
            ) : (
              <div className="flex min-h-32 flex-col justify-between border border-dashed border-[#c8bda9] bg-[#fcfaf5] p-5 text-[#59615c] shadow-sm">
                <span className="text-sm uppercase tracking-[0.18em] text-[#8a1f2d]">PayPal</span>
                <span className="text-lg font-semibold">{copy.support.pendingLabel}</span>
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-5">
          {copy.support.supportSections.map((section) => (
            <article key={section.title} className="border border-[#ded8cc] bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-[#59615c] sm:text-base">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-8 border border-[#d9d1c3] bg-[#fffdf9] p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#8a1f2d]" aria-hidden="true" />
            <div className="space-y-3 text-sm leading-7 text-[#59615c]">
              <p>{copy.support.footerPending}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
