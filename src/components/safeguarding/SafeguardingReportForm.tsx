"use client";

// Public safeguarding report form. No login required — a child or
// bystander must be able to report. Every reporter field is OPTIONAL
// (anonymous allowed); only the concern type + description are required.
// risk level / status are NOT here — the safeguarding lead sets those.

import { useState } from "react";
import {
  REPORT_TYPES,
  REPORT_TYPE_LABELS,
  type ReportType,
} from "@/lib/safeguarding-report-types";

type FormState = {
  report_type: ReportType | "";
  description: string;
  reporter_name: string;
  reporter_email: string;
  reporter_relationship: string;
  child_reference: string;
  website: string; // honeypot
};

const EMPTY: FormState = {
  report_type: "",
  description: "",
  reporter_name: "",
  reporter_email: "",
  reporter_relationship: "",
  child_reference: "",
  website: "",
};

export function SafeguardingReportForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.report_type) {
      setError("Please choose what your concern is about.");
      return;
    }
    if (form.description.trim().length < 20) {
      setError("Please describe the concern in a little more detail (at least 20 characters).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/safeguarding-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_type: form.report_type,
          description: form.description,
          reporter_name: form.reporter_name || undefined,
          reporter_email: form.reporter_email || undefined,
          reporter_relationship: form.reporter_relationship || undefined,
          child_reference: form.child_reference || undefined,
          website: form.website || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setDone(true);
        return;
      }
      if (res.status === 429) {
        setError("Too many submissions from this connection. Please try again later.");
      } else if (body.error === "invalid_input") {
        setError(body.message || "Please check the form and try again.");
      } else {
        setError(
          "Sorry, we couldn't submit your report right now. If a child is in immediate danger, contact local authorities. Otherwise please email support@orphangive.org.",
        );
      }
    } catch {
      setError(
        "Sorry, something went wrong. If a child is in immediate danger, contact local authorities. Otherwise please email support@orphangive.org.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-ink/[0.08] bg-white p-8 max-md:p-6">
        <h2 className="font-display text-2xl text-ink">Thank you — your report has been received.</h2>
        <p className="mt-4 text-ink-soft leading-[1.65]">
          It will be reviewed in confidence by our safeguarding lead. We take every
          concern seriously. You don&apos;t need to do anything else.
        </p>
        <p className="mt-4 text-ink font-medium leading-[1.65]">
          If a child is in immediate danger, contact your local police or emergency
          services now — please don&apos;t wait for us.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-3xl border border-ink/[0.08] bg-white p-8 max-md:p-6">
      {/* Emergency banner — always visible above the form. */}
      <div className="rounded-2xl bg-orange-pale/60 border border-tangerine/30 px-4 py-3 mb-6">
        <p className="text-sm text-ink leading-[1.55]">
          <strong>If a child is in immediate danger</strong>, contact your local
          police or emergency services first. This form is for raising a concern
          with our safeguarding lead — it is not monitored 24/7.
        </p>
      </div>

      {/* Required: what + description */}
      <label className="block mb-5">
        <span className="block text-sm font-medium text-ink mb-1.5">What is your concern about? *</span>
        <select
          required
          value={form.report_type}
          onChange={(e) => set("report_type", e.target.value as ReportType)}
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink focus:border-tangerine focus:outline-none"
        >
          <option value="" disabled>
            Choose one…
          </option>
          {REPORT_TYPES.map((t) => (
            <option key={t} value={t}>
              {REPORT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="block mb-5">
        <span className="block text-sm font-medium text-ink mb-1.5">Please describe the concern *</span>
        <textarea
          required
          rows={6}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Tell us what happened, when, and anything that would help us understand the concern."
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink leading-[1.6] focus:border-tangerine focus:outline-none"
        />
      </label>

      <label className="block mb-5">
        <span className="block text-sm font-medium text-ink mb-1.5">
          Which child or situation does this relate to? <span className="text-ink-soft font-normal">(optional)</span>
        </span>
        <textarea
          rows={2}
          value={form.child_reference}
          onChange={(e) => set("child_reference", e.target.value)}
          placeholder="A first name, a profile, a location — only if you know it. You don't have to name anyone."
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink leading-[1.6] focus:border-tangerine focus:outline-none"
        />
      </label>

      {/* Optional reporter details — anonymous is fine. */}
      <fieldset className="border-t border-ink/[0.08] pt-5 mt-1">
        <legend className="text-sm text-ink-soft mb-3">
          Your details — <strong className="text-ink">all optional</strong>. You may report
          anonymously. If you leave an email, we&apos;ll confirm we received your report (no case details).
        </legend>
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">Your name (optional)</span>
            <input
              type="text"
              value={form.reporter_name}
              onChange={(e) => set("reporter_name", e.target.value)}
              className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink focus:border-tangerine focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">Your email (optional)</span>
            <input
              type="email"
              value={form.reporter_email}
              onChange={(e) => set("reporter_email", e.target.value)}
              className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink focus:border-tangerine focus:outline-none"
            />
          </label>
        </div>
        <label className="block mt-4">
          <span className="block text-sm font-medium text-ink mb-1.5">
            Your relationship to the child / situation (optional)
          </span>
          <input
            type="text"
            value={form.reporter_relationship}
            onChange={(e) => set("reporter_relationship", e.target.value)}
            placeholder="e.g. guardian, neighbour, teacher, donor"
            className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink focus:border-tangerine focus:outline-none"
          />
        </label>
      </fieldset>

      {/* Honeypot — visually hidden, off-screen, not tabbable. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className="mt-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex items-center justify-center w-full rounded-full bg-ink text-cream font-body font-semibold py-3.5 text-base hover:bg-tangerine hover:text-ink transition-colors duration-200 disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit report"}
      </button>
    </form>
  );
}

export default SafeguardingReportForm;
