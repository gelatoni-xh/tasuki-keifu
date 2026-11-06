import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

// Explicit scratch DB only. Never load the repository's default DATABASE_URL here.
const testUrl = new URL(
  process.env.DATABASE_URL || "postgresql://invalid/invalid",
);
if (
  testUrl.pathname !== "/feedback_test" ||
  !["127.0.0.1", "localhost"].includes(testUrl.hostname)
)
  throw new Error("Use an isolated feedback_test database");

test("feedback persists, deduplicates, limits abuse and survives mail failure", async () => {
  const { POST } = await import("../src/app/api/feedback/route");
  const { prisma } = await import("../src/lib/prisma");
  const { notifyFeedback } = await import("../src/lib/feedback/mail");
  let deliveries = 0;
  let message = "";
  const server = createServer((socket) => {
    socket.write("220 local.test ESMTP\r\n");
    let buffer = "";
    let inData = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === ".") {
            deliveries++;
            inData = false;
            socket.write("250 saved\r\n");
          } else message += line + "\n";
        } else if (/^EHLO/.test(line))
          socket.write("250-local.test\r\n250 OK\r\n");
        else if (/^DATA/.test(line)) {
          inData = true;
          socket.write("354 continue\r\n");
        } else if (/^QUIT/.test(line)) {
          socket.end("221 bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  Object.assign(process.env, {
    FEEDBACK_SMTP_USER: "",
    FEEDBACK_SMTP_PASSWORD: "",
    FEEDBACK_SMTP_HOST: "127.0.0.1",
    FEEDBACK_SMTP_PORT: String(address.port),
    FEEDBACK_MAIL_FROM: "archive@example.test",
    FEEDBACK_MAIL_TO: "owner@example.test",
  });
  const payload = {
    submissionKey: randomUUID(),
    locale: "zh",
    intent: "issue",
    subject: "person",
    category: "duplicate",
    scope: "multiple",
    description: "同一位选手出现了两次",
    sources: "官方资料",
    relatedPages: "/zh/players/a\n/zh/players/b",
    email: "reader@example.test",
    pagePath: "/zh/players/a",
  };
  const request = (
    body: unknown,
    ip = "127.0.0.1",
    origin = "http://localhost:3000",
  ) =>
    POST(
      new Request("http://localhost:3000/api/feedback", {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          "x-real-ip": ip,
        },
        body: JSON.stringify(body),
      }),
    );
  try {
    await prisma.userFeedback.deleteMany();
    const concurrent = await Promise.all([request(payload), request(payload)]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 201]);
    const receipt = await concurrent[0].json();
    assert.equal(deliveries, 1);
    assert.match(message, /Reply-To: reader@example.test/);
    assert.equal(await prisma.userFeedback.count(), 1);
    const row = await prisma.userFeedback.findUniqueOrThrow({
      where: { id: receipt.id },
    });
    assert.equal(row.notificationStatus, "sent");
    assert.equal(
      (row.payload as typeof payload).description,
      payload.description,
    );
    assert.ok(!row.clientKey.includes("127.0.0.1"));
    assert.equal(
      (await request({ ...payload, description: "changed" })).status,
      409,
    );
    assert.equal(
      (await request(payload, undefined, "https://foreign.test")).status,
      403,
    );
    assert.equal(
      (
        await request({
          ...payload,
          submissionKey: randomUUID(),
          description: "  ",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request({
          ...payload,
          submissionKey: randomUUID(),
          category: "mark",
        })
      ).status,
      400,
    );
    assert.equal(
      (await request({ ...payload, description: "a".repeat(45000) })).status,
      413,
    );
    delete process.env.FEEDBACK_SMTP_HOST;
    const failed = await request(
      { ...payload, submissionKey: randomUUID() },
      "127.0.0.2",
    );
    assert.equal(failed.status, 201);
    const failedId = (await failed.json()).id;
    assert.equal(
      (await prisma.userFeedback.findUniqueOrThrow({ where: { id: failedId } }))
        .notificationStatus,
      "failed",
    );
    process.env.FEEDBACK_SMTP_HOST = "127.0.0.1";
    await Promise.all([notifyFeedback(failedId), notifyFeedback(failedId)]);
    assert.equal(deliveries, 2);
    for (let i = 0; i < 4; i++)
      assert.equal(
        (await request({ ...payload, submissionKey: randomUUID() })).status,
        201,
      );
    assert.equal(
      (await request({ ...payload, submissionKey: randomUUID() })).status,
      429,
    );
    assert.equal((await request(payload)).status, 200); // Retry still works at the limit.
    console.log("Verified SMTP deliveries:", deliveries);
  } finally {
    await prisma.$disconnect();
    server.close();
  }
});
