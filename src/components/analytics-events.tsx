"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type AnalyticsEventName =
  | "home_search_submit"
  | "players_search_submit"
  | "players_filter_apply"
  | "player_profile_view"
  | "competition_detail_view"
  | "organization_detail_view"
  | "player_to_competition_click"
  | "player_to_organization_click"
  | "player_to_related_player_click"
  | "source_outbound_click";

function trackEvent(eventName: AnalyticsEventName, params: Record<string, string | number> = {}) {
  window.gtag?.("event", eventName, params);
}

function buildPageViewEvent(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length < 3) {
    return null;
  }

  const [locale, section, slug] = segments;
  const localeParam = { locale };

  if (section === "players") {
    return { name: "player_profile_view" as const, params: { ...localeParam, player_slug: slug } };
  }

  if (section === "competitions") {
    return { name: "competition_detail_view" as const, params: { ...localeParam, competition_slug: slug } };
  }

  if (section === "organizations") {
    return { name: "organization_detail_view" as const, params: { ...localeParam, organization_slug: slug } };
  }

  return null;
}

export function AnalyticsEvents() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    const search = searchParams.toString();
    const currentPath = `${pathname}${search ? `?${search}` : ""}`;

    if (lastTrackedPathRef.current === currentPath) {
      return;
    }

    lastTrackedPathRef.current = currentPath;

    const pageViewEvent = buildPageViewEvent(pathname);

    if (pageViewEvent) {
      trackEvent(pageViewEvent.name, pageViewEvent.params);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleSubmit(event: SubmitEvent) {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const eventName = form.dataset.analyticsEvent as AnalyticsEventName | undefined;

      if (!eventName) {
        return;
      }

      const query = new FormData(form).get("q");
      trackEvent(eventName, {
        form_name: form.dataset.analyticsForm ?? "unknown",
        query_length: typeof query === "string" ? query.trim().length : 0,
      });
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest("a[data-analytics-event]");

      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }

      const eventName = link.dataset.analyticsEvent as AnalyticsEventName | undefined;

      if (!eventName) {
        return;
      }

      trackEvent(eventName, {
        href: link.href,
        link_type: link.dataset.analyticsLinkType ?? "unknown",
      });
    }

    document.addEventListener("submit", handleSubmit);
    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("submit", handleSubmit);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return null;
}
