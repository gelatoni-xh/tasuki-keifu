import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { getDictionary, locales } from "@/lib/i18n";

type SiteHeaderProps = {
  locale: Locale;
  path: string;
};

export function SiteHeader({ locale, path }: SiteHeaderProps) {
  const dictionary = getDictionary(locale);

  return (
    <header className="sticky top-0 z-30 border-b border-[#ded8cc] bg-[#fbfaf7]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href={`/${locale}`} className="block">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]">
            {dictionary.site.label}
          </p>
          <h1 className="text-xl font-semibold">{dictionary.site.name}</h1>
        </Link>
        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-3 text-sm font-medium text-[#59615c] sm:flex" aria-label="Primary">
            <Link className="transition hover:text-[#8a1f2d]" href={`/${locale}/players`}>
              {dictionary.nav.players}
            </Link>
            <Link className="transition hover:text-[#8a1f2d]" href={`/${locale}/competitions`}>
              {dictionary.nav.competitions}
            </Link>
            <Link className="transition hover:text-[#8a1f2d]" href={`/${locale}/organizations`}>
              {dictionary.nav.organizations}
            </Link>
          </nav>
          <nav className="flex items-center gap-2 text-sm text-[#59615c]" aria-label="Language">
            {locales.map((targetLocale) => (
              <Link
                className={
                  targetLocale === locale
                    ? "border border-[#ded8cc] px-2 py-1 text-[#8a1f2d]"
                    : "px-2 py-1 transition hover:text-[#8a1f2d]"
                }
                href={`/${targetLocale}${path}`}
                key={targetLocale}
              >
                {dictionary.language[targetLocale]}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
