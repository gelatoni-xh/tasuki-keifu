"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { Locale } from "@/lib/i18n";

type NavigationItem = { href: string; label: string };

type MobileSiteNavProps = {
  locale: Locale;
  siteLabel: string;
  siteName: string;
  currentPath: string;
  localeOptions: Array<{ value: Locale; label: string; href: string }>;
  primaryItems: NavigationItem[];
  secondaryItems: NavigationItem[];
};

function isActivePath(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`) || path.startsWith(`${href}?`);
}

export function MobileSiteNav({
  locale,
  siteLabel,
  siteName,
  currentPath,
  localeOptions,
  primaryItems,
  secondaryItems,
}: MobileSiteNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-[#ded8cc] bg-[#fbfaf7]/95 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <Link href={`/${locale}`} className="block min-w-0" onClick={() => setIsOpen(false)}>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]">{siteLabel}</p>
          <span className="block truncate text-lg font-semibold leading-tight">{siteName}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <LocaleSwitcher
            ariaLabel="Language"
            className="w-[5.5rem]"
            currentLocale={locale}
            options={localeOptions}
            variant="compact"
          />
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls="mobile-site-navigation"
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setIsOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center border border-[#ded8cc] bg-white text-[#8a1f2d]"
          >
            {isOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {isOpen && (
        <div id="mobile-site-navigation" className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-[#ded8cc] bg-[#fbfaf7] px-5 py-4 shadow-lg">
          <nav className="grid grid-cols-2 gap-2 text-sm font-medium" aria-label="Primary">
            {primaryItems.map((item) => {
              const active = isActivePath(currentPath, item.href);

              return (
                <Link
                  className={active
                    ? "border border-[#b53b4d] bg-[#8a1f2d] px-3 py-3 text-center text-white"
                    : "border border-[#ded8cc] bg-white px-3 py-3 text-center text-[#59615c] transition hover:border-[#cfc7b8] hover:text-[#8a1f2d]"}
                  href={`/${locale}${item.href}`}
                  key={item.href}
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <nav className="mt-2 grid gap-2 text-sm" aria-label="Secondary">
            {secondaryItems.map((item) => {
              const active = isActivePath(currentPath, item.href);

              return (
                <Link
                  className={active
                    ? "border border-[#8a1f2d] bg-[#8a1f2d] px-3 py-3 text-center text-white shadow-sm"
                    : "border border-[#ded8cc] bg-white px-3 py-3 text-center text-[#59615c] transition hover:border-[#cfc7b8] hover:text-[#8a1f2d]"}
                  href={`/${locale}${item.href}`}
                  key={item.href}
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
