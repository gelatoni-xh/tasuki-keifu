"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type LocaleSwitcherProps = {
  ariaLabel: string;
  currentLocale: Locale;
  options: Array<{
    value: Locale;
    label: string;
    href: string;
  }>;
  className?: string;
};

export function LocaleSwitcher({ ariaLabel, currentLocale, options, className }: LocaleSwitcherProps) {
  const router = useRouter();
  const id = useId();
  const [, startTransition] = useTransition();
  const currentLabel = options.find((option) => option.value === currentLocale)?.label ?? currentLocale;

  return (
    <div className={className}>
      <div className="border border-[#d8cfbf] bg-white shadow-[0_10px_24px_rgba(31,36,33,0.06)]">
        <div className="flex items-center gap-2 border-b border-[#ebe3d6] px-3 py-2">
          <Languages className="h-4 w-4 text-[#8a1f2d]" aria-hidden="true" />
          <label className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]" htmlFor={id}>
            {ariaLabel}
          </label>
        </div>
        <div className="px-3 py-3">
          <p className="mb-2 text-xs text-[#7a807a]">当前: {currentLabel}</p>
          <select
            aria-label={ariaLabel}
            className="w-full appearance-none border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2.5 text-sm font-medium text-[#2d342f] outline-none transition focus:border-[#8a1f2d]"
            defaultValue={currentLocale}
            id={id}
            onChange={(event) => {
              const nextHref = options.find((option) => option.value === event.target.value)?.href;

              if (!nextHref) {
                return;
              }

              startTransition(() => {
                router.push(nextHref);
              });
            }}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
