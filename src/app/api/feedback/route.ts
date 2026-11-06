import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { feedbackSchema } from "@/lib/feedback/schema";
import { notifyFeedback } from "@/lib/feedback/mail";

export const runtime = "nodejs";
const MAX_BYTES = 40_000;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const canonical = new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://tasukikeifu.com",
  ).origin;
  const allowed =
    process.env.NODE_ENV === "production"
      ? canonical
      : new URL(request.url).origin;
  if (origin !== allowed)
    return NextResponse.json({ error: "origin" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ error: "content_type" }, { status: 415 });
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "too_large" }, { status: 413 });
      }
      chunks.push(value);
    }
    input = feedbackSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const secret = process.env.FEEDBACK_RATE_LIMIT_SECRET;
  if (!secret && process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  // Production proxy must overwrite X-Real-IP; the app port is bound to loopback.
  const clientKey = createHmac("sha256", secret || "local-feedback")
    .update(request.headers.get("x-real-ip") || "unknown")
    .digest("hex");
  const { submissionKey, ...payload } = input;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // One short shared lock keeps cross-process limits and idempotency atomic.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(78341620)`;
      const existing = await tx.userFeedback.findUnique({
        where: { submissionKey },
      });
      if (existing) {
        const original = existing.payload as Record<string, unknown>;
        const same = Object.entries(payload).every(
          ([key, value]) => original[key] === value,
        );
        return same
          ? { id: existing.id, inserted: false }
          : { error: "conflict" as const };
      }
      const now = Date.now();
      const [personal, global] = await Promise.all([
        tx.userFeedback.count({
          where: { clientKey, createdAt: { gte: new Date(now - 600_000) } },
        }),
        tx.userFeedback.count({
          where: { createdAt: { gte: new Date(now - 3_600_000) } },
        }),
      ]);
      if (personal >= 5 || global >= 100)
        return { error: "rate_limit" as const };
      const row = await tx.userFeedback.create({
        data: { submissionKey, payload, clientKey },
      });
      return { id: row.id, inserted: true };
    });
    if ("error" in result)
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "conflict" ? 409 : 429 },
      );
    if (result.inserted) {
      try {
        await notifyFeedback(result.id);
      } catch {
        console.error("feedback_notification_state_failed", result.id);
      }
    }
    return NextResponse.json(
      { id: result.id },
      { status: result.inserted ? 201 : 200 },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
