import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { Locale } from "@/lib/i18n";
import { getDictionary, locales } from "@/lib/i18n";
import { getStaticPageCopy } from "@/lib/static-pages";

type SiteHeaderProps = {
  locale: Locale;
  path: string;
};

function normalizeLanguageSwitchPath(path: string) {
  if (!path) {
    return "";
  }

  const localePrefixPattern = new RegExp(`^/(${locales.join("|")})(?=/|$)`);

  return path.replace(localePrefixPattern, "");
}

function isActivePath(path: string, href: string) {
  if (!path) {
    return href === "";
  }

  return path === href || path.startsWith(`${href}/`) || path.startsWith(`${href}?`);
}

export function SiteHeader({ locale, path }: SiteHeaderProps) {
  const dictionary = getDictionary(locale);
  const staticPageCopy = getStaticPageCopy(locale);
  const normalizedPath = normalizeLanguageSwitchPath(path);
  const localeOptions = locales.map((targetLocale) => ({
    value: targetLocale,
    label: dictionary.language[targetLocale],
    href: `/${targetLocale}${normalizedPath}`,
  }));
  const navigationItems = [
    {
      href: "/players",
      label: dictionary.nav.players,
    },
    {
      href: "/competitions",
      label: dictionary.nav.competitions,
    },
    {
      href: "/organizations",
      label: dictionary.nav.organizations,
    },
  ];
  const secondaryNavigationItems = [
    {
      href: "/support",
      label: staticPageCopy.labels.support,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[#ded8cc] bg-[#fbfaf7]/95 backdrop-blur lg:hidden">
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <Link href={`/${locale}`} className="block">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]">
                {dictionary.site.label}
              </p>
              <h1 className="text-xl font-semibold">{dictionary.site.name}</h1>
            </Link>
            <LocaleSwitcher
              ariaLabel="Language"
              className="min-w-[13rem]"
              currentLocale={locale}
              options={localeOptions}
            />
          </div>
          <nav className="mt-4 flex flex-wrap gap-2 text-sm font-medium" aria-label="Primary">
            {navigationItems.map((item) => {
              const active = isActivePath(normalizedPath, item.href);

              return (
                <Link
                  className={
                    active
                      ? "border border-[#b53b4d] bg-[#8a1f2d] px-3 py-2 text-white"
                      : "border border-[#ded8cc] bg-white px-3 py-2 text-[#59615c] transition hover:border-[#cfc7b8] hover:text-[#8a1f2d]"
                  }
                  href={`/${locale}${item.href}`}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Secondary">
            {secondaryNavigationItems.map((item) => {
              const active = isActivePath(normalizedPath, item.href);

              return (
                <Link
                  className={
                    active
                      ? "border border-[#8a1f2d] bg-[#8a1f2d] px-3 py-2 text-white shadow-sm"
                      : "border border-[#ded8cc] bg-white px-3 py-2 text-[#59615c] transition hover:border-[#cfc7b8] hover:text-[#8a1f2d]"
                  }
                  href={`/${locale}${item.href}`}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-[#d9d1c3] bg-[linear-gradient(180deg,#f8f4eb_0%,#f2ede2_100%)] lg:flex">
        <div className="flex h-full w-full flex-col px-6 py-8">
          <Link href={`/${locale}`} className="block border-b border-[#d8cfbf] pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a1f2d]">
              {dictionary.site.label}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[0.02em] text-[#1f2421]">{dictionary.site.name}</h1>
            <p className="mt-3 text-sm leading-6 text-[#59615c]">{dictionary.site.subtitle}</p>
          </Link>

          <nav className="mt-8 flex flex-col gap-3" aria-label="Primary">
            {navigationItems.map((item) => {
              const active = isActivePath(normalizedPath, item.href);

              return (
                <Link
                  className={
                    active
                      ? "border border-[#8a1f2d] bg-[#8a1f2d] px-4 py-4 text-white shadow-[0_12px_30px_rgba(138,31,45,0.16)]"
                      : "border border-[#d8cfbf] bg-white/78 px-4 py-4 text-[#2d342f] transition hover:-translate-y-0.5 hover:border-[#c4b9a5] hover:bg-white"
                  }
                  href={`/${locale}${item.href}`}
                  key={item.href}
                >
                  <p className="text-lg font-semibold">{item.label}</p>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-5 border-t border-[#d8cfbf] pt-6">
            <nav className="grid gap-3 text-sm" aria-label="Secondary">
              {secondaryNavigationItems.map((item) => {
                const active = isActivePath(normalizedPath, item.href);

                return (
                  <Link
                    className={
                      active
                        ? "border border-[#8a1f2d] bg-[#8a1f2d] px-4 py-3 font-medium text-white shadow-[0_10px_24px_rgba(138,31,45,0.14)]"
                        : "border border-[#d8cfbf] bg-white/82 px-4 py-3 text-[#2d342f] transition hover:-translate-y-0.5 hover:border-[#c4b9a5] hover:bg-white"
                    }
                    href={`/${locale}${item.href}`}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <LocaleSwitcher
              ariaLabel="Language"
              currentLocale={locale}
              options={localeOptions}
            />
            <p className="text-sm leading-6 text-[#6a726d]">{dictionary.site.footer}</p>
          </div>
        </div>
      </aside>
    </>
  );
}
