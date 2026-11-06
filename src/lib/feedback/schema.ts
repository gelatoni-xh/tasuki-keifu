import { z } from "zod";

export const subjects = [
  "person",
  "organization",
  "membership",
  "results",
  "unknown",
] as const;
export const issues = {
  person: [
    "duplicate",
    "mixed",
    "name",
    "profile",
    "missing",
    "outdated",
    "other",
  ],
  organization: [
    "duplicate",
    "mixed",
    "name",
    "profile",
    "missing",
    "outdated",
    "other",
  ],
  membership: [
    "affiliation",
    "dates",
    "outdated",
    "duplicate",
    "missing",
    "relation",
    "other",
  ],
  results: [
    "edition",
    "mark",
    "attribution",
    "team",
    "pb",
    "duplicate",
    "missing",
    "other",
  ],
  unknown: [
    "incorrect",
    "missing",
    "outdated",
    "duplicate",
    "inconsistent",
    "other",
  ],
} as const;
export const wishes = [
  "person",
  "organization",
  "results",
  "history",
  "membership",
  "pb",
  "other",
] as const;
export const feedbackSchema = z
  .object({
    submissionKey: z.uuid(),
    locale: z.enum(["ja", "zh", "zh-Hant", "en", "ko"]),
    intent: z.enum(["issue", "wish", "other"]),
    subject: z.enum(subjects),
    category: z.string().max(40),
    scope: z.enum(["page", "multiple", "global"]),
    description: z.string().trim().min(1).max(3000),
    sources: z.string().max(2000).default(""),
    relatedPages: z.string().max(2000).default(""),
    email: z.union([z.literal(""), z.email().max(254)]).default(""),
    pagePath: z
      .string()
      .max(1000)
      .regex(/^\/(?!\/)[^?#\r\n]*$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed: readonly string[] =
      value.intent === "issue"
        ? issues[value.subject]
        : value.intent === "wish"
          ? wishes
          : ["website", "suggestion", "other"];
    if (!allowed.includes(value.category))
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Invalid category",
      });
  });
export type FeedbackInput = z.infer<typeof feedbackSchema>;
