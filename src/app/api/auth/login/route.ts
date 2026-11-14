import { NextResponse } from "next/server";
import { checkCredentials, createSessionToken, OBSERVABILITY_COOKIE } from "@/lib/observability-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const requestedNext = String(form.get("next") ?? "/observability");
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/observability";
  if (!checkCredentials(username, password)) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, request.url), 303);
  }
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(OBSERVABILITY_COOKIE, createSessionToken(username), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
