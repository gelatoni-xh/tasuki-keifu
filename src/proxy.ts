import { NextRequest, NextResponse } from "next/server";

export function observabilityLocale(value: string) {
  if (value === "zh" || value.toLowerCase() === "zh-hant") return "zh";
  if (value === "ja") return "ja";
  return "en";
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) return NextResponse.next();
  const localizedLogin = path.match(/^\/([a-z-]+)\/login$/i);
  if (localizedLogin) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `/${observabilityLocale(localizedLogin[1])}/observability`);
    return NextResponse.redirect(login);
  }
  const localizedObservability = path.match(/^\/([a-z-]+)\/observability(?:\/|$)/i);
  if (localizedObservability && !["en", "zh", "ja"].includes(localizedObservability[1])) {
    const fallback = new URL(`/${observabilityLocale(localizedObservability[1])}/observability`, request.url);
    fallback.search = request.nextUrl.search;
    return NextResponse.redirect(fallback);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
