import { NextResponse } from "next/server";
import { getObservabilityOverview } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const task = new URL(request.url).searchParams.get("task") ?? undefined;
  return NextResponse.json(await getObservabilityOverview(task));
}
