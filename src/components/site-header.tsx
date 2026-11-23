import Link from "next/link";
import { cookies } from "next/headers";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MobileSiteNav } from "@/components/mobile-site-nav";
import type { Locale } from "@/lib/i18n";
import { getDictionary, locales } from "@/lib/i18n";
import { getStaticPageCopy } from "@/lib/static-pages";
import { OBSERVABILITY_COOKIE, verifySessionToken } from "@/lib/observability-auth";

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

export async function SiteHeader({ locale, path }: SiteHeaderProps) {
  const dictionary = getDictionary(locale);
  const cookieStore = await cookies();
  const isSignedIn = verifySessionToken(cookieStore.get(OBSERVABILITY_COOKIE)?.value);
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
    {
      href: "/relations-lab",
      label: dictionary.relationsLab.title,
    },
  ];
  const secondaryNavigationItems = [
    {
      href: "/support",
      label: staticPageCopy.labels.support,
    },
    { href: "/observability", label: dictionary.nav.observability },
    ...(!isSignedIn ? [{ href: `/login?next=/${locale}/observability`, label: dictionary.nav.login }] : []),
  ];

  return (
    <>
      <MobileSiteNav
        locale={locale}
        siteLabel={dictionary.site.label}
        siteName={dictionary.site.name}
        currentPath={normalizedPath}
        localeOptions={localeOptions}
        primaryItems={navigationItems}
        secondaryItems={secondaryNavigationItems}
      />

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
