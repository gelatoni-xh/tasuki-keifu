import { NextRequest, NextResponse } from "next/server";
const COOKIE = "tasuki_observability_session";

function decode(value: string) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
}

async function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  const [username, expiresAt, signature] = token.split(".");
  const secret = process.env.TASUKI_ADMIN_SESSION_SECRET || process.env.TASUKI_ADMIN_PASSWORD || process.env.OBSERVABILITY_PASSWORD;
  if (!username || !expiresAt || !signature || !secret || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, decode(signature), new TextEncoder().encode(`${username}.${expiresAt}`));
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (/^\/(?:[a-z]{2}\/)?observability(?:\/|$)/.test(path) || path.startsWith("/api/observability/")) {
    if (!(await verifySessionToken(request.cookies.get(COOKIE)?.value))) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", `${path}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
