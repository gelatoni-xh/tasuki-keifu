import { FeedbackWidget } from "@/components/feedback-widget";
import type { Metadata } from "next";
import { isLocale } from "@/lib/i18n";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<unknown>;
};

export async function generateMetadata({ params }: Omit<LocaleLayoutProps, "children">): Promise<Metadata> {
  const resolvedParams = await params;
  const locale = typeof resolvedParams === "object" && resolvedParams !== null && "locale" in resolvedParams
    ? (resolvedParams as { locale?: string }).locale
    : undefined;

  if (typeof locale !== "string" || !isLocale(locale) || locale === "ja") {
    return {};
  }

  return {
    robots: {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
      },
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const resolved = await params as { locale?: string };
  const locale = resolved.locale;
  return <>{children}{locale && isLocale(locale) && <FeedbackWidget locale={locale} />}</>;
}
