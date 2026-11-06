"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/i18n";
import { feedbackCopy } from "@/lib/feedback/translations";
import {
  issues,
  subjects,
  wishes,
  type FeedbackInput,
} from "@/lib/feedback/schema";
import "./feedback-widget.css";

export function FeedbackWidget({ locale }: { locale: Locale }) {
  const path = usePathname();
  const copy = feedbackCopy[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [isOpen]);
  const [intent, setIntent] = useState<FeedbackInput["intent"]>("issue");
  const [subject, setSubject] = useState<FeedbackInput["subject"]>("unknown");
  const [category, setCategory] = useState("incorrect");
  const [page, setPage] = useState(path);
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error" | "limited"
  >("idle");
  const initialized = useRef(false);
  const [receipt, setReceipt] = useState("");
  const options: readonly string[] =
    intent === "issue"
      ? issues[subject]
      : intent === "wish"
        ? wishes
        : ["website", "suggestion", "other"];
  function open() {
    if (!dialog.current?.open) {
      setPage(path);
      if (!initialized.current) {
        const inferred = path.includes("/players/")
          ? "person"
          : path.includes("/organizations/")
            ? "organization"
            : /\/(competitions|races)\//.test(path)
              ? "results"
              : "unknown";
        setSubject(inferred);
        setCategory(issues[inferred][0]);
        initialized.current = true;
      }
      dialog.current?.showModal();
      setIsOpen(true);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      ...data,
      intent,
      subject,
      category,
      locale,
      pagePath: page,
    };
    const body = JSON.stringify(payload);
    if (attempt.current?.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    setStatus("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          submissionKey: attempt.current.key,
        }),
      });
      if (!response.ok) {
        setStatus(response.status === 429 ? "limited" : "error");
        return;
      }
      const result = await response.json();
      setReceipt(result.id);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }
  const label = (key: string) =>
    copy.labels[key as keyof typeof copy.labels] || key;
  return (
    <>
      <button
        ref={launcher}
        className="feedback-launcher"
        onClick={open}
        aria-haspopup="dialog"
        aria-label={copy.launcher}
      >
        <Image
          src="/feedback/tasuki-spirit.webp"
          width={77}
          height={96}
          alt=""
        />
        <span>{copy.launcher}</span>
      </button>
      <dialog
        ref={dialog}
        className="feedback-dialog"
        aria-labelledby="feedback-title"
        onClose={() => {
          setIsOpen(false);
          launcher.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="feedback-panel">
          <header>
            <div>
              <small>TASUKI KEIFU</small>
              <h2 id="feedback-title">{copy.title}</h2>
            </div>
            <button
              type="button"
              className="feedback-close"
              aria-label={copy.close}
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </header>
          {status === "success" ? (
            <div className="feedback-success" role="status">
              <Image
                src="/feedback/tasuki-spirit.webp"
                width={77}
                height={96}
                alt=""
              />
              <h3>{copy.success}</h3>
              <p>{copy.successDetail}</p>
              <code>{receipt}</code>
              <button
                type="button"
                className="feedback-submit"
                onClick={() => {
                  setStatus("idle");
                  attempt.current = null;
                }}
              >
                {copy.again}
              </button>
            </div>
          ) : (
            <>
              <p className="feedback-intro">{copy.intro}</p>
              <form onSubmit={submit}>
                <fieldset disabled={status === "sending"}>
                  <label>
                    {copy.intent}
                    <select
                      value={intent}
                      onChange={(e) => {
                        const next = e.target.value as typeof intent;
                        setIntent(next);
                        setCategory(
                          next === "issue"
                            ? issues[subject][0]
                            : next === "wish"
                              ? wishes[0]
                              : "website",
                        );
                      }}
                    >
                      {["issue", "wish", "other"].map((v, i) => (
                        <option key={v} value={v}>
                          {copy.intents[i]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="feedback-grid">
                    {intent === "issue" && (
                      <label>
                        {copy.subject}
                        <select
                          value={subject}
                          onChange={(e) => {
                            const next = e.target.value as typeof subject;
                            setSubject(next);
                            setCategory(issues[next][0]);
                          }}
                        >
                          {subjects.map((v, i) => (
                            <option value={v} key={v}>
                              {copy.subjects[i]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      {copy.category}
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {options.map((v) => (
                          <option value={v} key={v}>
                            {label(v)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    {copy.scope}
                    <select name="scope" defaultValue="page">
                      {["page", "multiple", "global"].map((v, i) => (
                        <option value={v} key={v}>
                          {copy.scopes[i]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {copy.description} <span aria-hidden="true">*</span>
                    <textarea
                      name="description"
                      required
                      maxLength={3000}
                      rows={4}
                      placeholder={copy.hint}
                    />
                  </label>
                  <details>
                    <summary>{copy.detailToggle}</summary>
                    <label>
                      {copy.sources}
                      <textarea
                        name="sources"
                        maxLength={2000}
                        rows={2}
                        placeholder={copy.optionalHint}
                      />
                    </label>
                    <label>
                      {copy.related}
                      <textarea name="relatedPages" maxLength={2000} rows={2} />
                    </label>
                    <label>
                      {copy.email}
                      <input
                        name="email"
                        type="email"
                        maxLength={254}
                        autoComplete="email"
                      />
                    </label>
                  </details>
                  <p className="feedback-page">
                    {copy.page}: <span>{page}</span>
                  </p>
                  <p className="feedback-privacy">{copy.privacy}</p>
                  {(status === "error" || status === "limited") && (
                    <p role="alert" className="feedback-error">
                      {status === "limited" ? copy.limited : copy.error}
                    </p>
                  )}
                  <button className="feedback-submit" type="submit">
                    {status === "sending" ? copy.sending : copy.send}
                  </button>
                </fieldset>
              </form>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
