import { NextResponse } from "next/server";
import { OBSERVABILITY_COOKIE, publicSiteOrigin } from "@/lib/observability-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", publicSiteOrigin(request)), 303);
  response.cookies.set(OBSERVABILITY_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return response;
}
