import { prisma } from "../src/lib/prisma";
import { notifyFeedback } from "../src/lib/feedback/mail";

async function main() {
  const id = process.argv[2];
  if (!id)
    throw new Error(
      "Usage: pnpm exec tsx deploy/retry-feedback.ts <feedback-id> [--recover-interrupted]",
    );
  try {
    // Explicit recovery only: confirm the original sender has stopped first.
    if (process.argv.includes("--recover-interrupted")) {
      await prisma.userFeedback.updateMany({
        where: { id, notificationStatus: "sending" },
        data: { notificationStatus: "failed" },
      });
    }
    await notifyFeedback(id);
    const row = await prisma.userFeedback.findUniqueOrThrow({ where: { id } });
    console.log(
      JSON.stringify({
        id,
        status: row.notificationStatus,
        attempts: row.notificationAttempts,
        error: row.notificationLastError,
      }),
    );
    if (row.notificationStatus !== "sent") process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error("Feedback retry failed; inspect database notification state.");
  process.exitCode = 1;
});
