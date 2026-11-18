import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getObservabilityOverview } from "@/lib/observability";
import { OBSERVABILITY_COOKIE, verifySessionToken } from "@/lib/observability-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const task = new URL(request.url).searchParams.get("task") ?? undefined;
  const signedIn = verifySessionToken((await cookies()).get(OBSERVABILITY_COOKIE)?.value);
  return NextResponse.json(await getObservabilityOverview(task, signedIn));
}
