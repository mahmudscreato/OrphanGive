"use client";

import { useState, type FormEvent } from "react";

/**
 * Session 19 — Contact form (UI only).
 *
 * Captures name + email + subject + message, validates the basics,
 * logs the payload to the browser console, and renders a quiet
 * success state. No backend wired — see TODO below. Until the
 * backend lands, the data is NOT persisted; the success copy is
 * cosmetic.
 */

const SUBJECTS = [
  { value: "sponsorship", label: "Sponsorship question" },
  { value: "technical", label: "Technical issue" },
  { value: "press", label: "Press inquiry" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other" },
] as const;

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState<typeof SUBJECTS[number]["value"]>(
    "sponsorship",
  );
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitted">("idle");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.includes("@") || message.trim().length < 5) return;
    // TODO: wire to Resend (transactional email) or a Directus
    // `contact_submission` collection. Currently logs only.
    console.log("[contact-form] submission (not persisted):", {
      name: name.trim(),
      email: email.trim(),
      subject,
      message: message.trim(),
    });
    setStatus("submitted");
  }

  if (status === "submitted") {
    return (
      <div
        className="rounded-2xl border border-tangerine-soft bg-tangerine-mist/40 px-6 py-7 text-center"
        role="status"
      >
        <div className="font-display font-semibold text-xl text-ink">
          Thanks{name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ""}.
        </div>
        <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-md mx-auto">
          We&apos;ve received your message and will respond within
          two business days. If it&apos;s urgent, drop a note to{" "}
          <a
            href="mailto:support@orphangive.org"
            className="text-tangerine-deep font-medium hover:underline"
          >
            support@orphangive.org
          </a>{" "}
          directly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
        <div>
          <label
            htmlFor="contact-name"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Your name
          </label>
          <input
            id="contact-name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
          />
        </div>
        <div>
          <label
            htmlFor="contact-email"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Email address
          </label>
          <input
            id="contact-email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="contact-subject"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Subject
        </label>
        <select
          id="contact-subject"
          value={subject}
          onChange={(e) =>
            setSubject(e.target.value as typeof SUBJECTS[number]["value"])
          }
          className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
        >
          {SUBJECTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm font-medium text-ink mb-1.5"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={6}
          placeholder="What can we help with?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200 resize-y"
        />
      </div>

      <button
        type="submit"
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-orange-solid text-white font-body font-semibold py-3 px-7 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px"
      >
        Send message
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-200 group-hover:translate-x-1"
        >
          →
        </span>
      </button>
    </form>
  );
}

export default ContactForm;
