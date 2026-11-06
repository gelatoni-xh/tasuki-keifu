import { feedbackCopy } from "@/lib/feedback/translations";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

// Called only after the feedback has committed. A delivery failure never loses a report.
export async function notifyFeedback(id: string) {
  const claim = await prisma.userFeedback.updateMany({
    where: { id, notificationStatus: { in: ["pending", "failed"] } },
    data: {
      notificationStatus: "sending",
      notificationAttempts: { increment: 1 },
      notificationLastError: null,
    },
  });
  if (!claim.count) return;
  try {
    const feedback = await prisma.userFeedback.findUniqueOrThrow({
      where: { id },
    });
    const host = process.env.FEEDBACK_SMTP_HOST;
    const from = process.env.FEEDBACK_MAIL_FROM;
    const to = process.env.FEEDBACK_MAIL_TO;
    if (!host || !from || !to)
      throw Object.assign(new Error("Mail not configured"), {
        code: "NOT_CONFIGURED",
      });
    const port = Number(process.env.FEEDBACK_SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: process.env.NODE_ENV === "production" && port !== 465,
      auth: process.env.FEEDBACK_SMTP_USER
        ? {
            user: process.env.FEEDBACK_SMTP_USER,
            pass: process.env.FEEDBACK_SMTP_PASSWORD,
          }
        : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });
    const payload = feedback.payload as Record<string, string>;
    const copy = feedbackCopy.zh;
    const category =
      copy.labels[payload.category as keyof typeof copy.labels] ||
      payload.category;
    const fields: Record<string, string> = {
      反馈类型: (
        {
          issue: "数据问题",
          wish: "希望补充数据",
          other: "网站问题 / 其他建议",
        } as Record<string, string>
      )[payload.intent],
      数据对象:
        copy.subjects[
          [
            "person",
            "organization",
            "membership",
            "results",
            "unknown",
          ].indexOf(payload.subject)
        ],
      具体分类: category,
      影响范围:
        copy.scopes[["page", "multiple", "global"].indexOf(payload.scope)],
      详细说明: payload.description,
      参考资料: payload.sources,
      相关页面: payload.relatedPages,
      联系邮箱: payload.email,
      当前页面: payload.pagePath,
      界面语言: payload.locale,
    };
    await transport.sendMail({
      from,
      to,
      replyTo: payload.email || undefined,
      subject: `[襷の系譜] 用户反馈 ${id}`,
      text:
        `反馈编号：${id}\n提交时间：${feedback.createdAt.toISOString()}\n\n` +
        Object.entries(fields)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n\n"),
    });
    await prisma.userFeedback.update({
      where: { id },
      data: { notificationStatus: "sent", notificationSentAt: new Date() },
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "DELIVERY_FAILED";
    await prisma.userFeedback.update({
      where: { id },
      data: {
        notificationStatus: "failed",
        notificationLastError: code.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
      },
    });
  }
}
