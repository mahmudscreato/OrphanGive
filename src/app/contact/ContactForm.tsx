"use client";

import { useState, useTransition, type FormEvent } from "react";

/**
 * Session 32 — Contact form.
 *
 * Captures name + email + subject + message. Wired in this session
 * to POST `/api/contact` which sends via Resend to
 * support@orphangive.org. Success / error states reflect actual
 * delivery, not the cosmetic placeholder from Session 19.
 *
 * New "I know an orphan who needs support" subject (Mahmud's
 * review answer #7) reveals additional fields conditionally:
 * relationship, child's first name, age, location, situation.
 * Those fields stay hidden — and unrequired — until the option
 * is selected, so the typical contact path remains short.
 *
 * TODO: future feature — guardian dashboard for profile submission
 * flow. The orphan-referral path here is the v1 entry point;
 * v2 graduates this to an authenticated guardian account →
 * child profile draft → admin review pipeline. (Tracked in
 * Session 17.5 Bucket C.)
 */

const SUBJECTS = [
  { value: "sponsorship", label: "Sponsorship question" },
  { value: "technical", label: "Technical issue" },
  { value: "press", label: "Press inquiry" },
  { value: "partnership", label: "Partnership" },
  { value: "orphan_referral", label: "I know an orphan who needs support" },
  { value: "other", label: "Other" },
] as const;

type SubjectValue = typeof SUBJECTS[number]["value"];

const RELATIONSHIPS = [
  { value: "guardian", label: "Legal guardian" },
  { value: "relative", label: "Relative" },
  { value: "community", label: "Community member" },
  { value: "other", label: "Other" },
] as const;

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200";

const labelClass = "block text-sm font-medium text-ink mb-1.5";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState<SubjectValue>("sponsorship");
  const [message, setMessage] = useState("");

  // --- orphan-referral conditional fields -------------------------
  const [relationship, setRelationship] = useState<string>("guardian");
  const [childFirstName, setChildFirstName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [childLocation, setChildLocation] = useState("");
  const [orphanDescription, setOrphanDescription] = useState("");

  const [status, setStatus] = useState<"idle" | "submitted">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isReferral = subject === "orphan_referral";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please tell us your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError("Please enter a valid email address.");
    }
    if (isReferral) {
      if (!childFirstName.trim()) return setError("Child's first name is required.");
      if (!childAge.trim()) return setError("Child's approximate age is required.");
      if (!childLocation.trim()) return setError("Child's location is required.");
      if (orphanDescription.trim().length < 5) {
        return setError("Please describe the situation briefly.");
      }
    } else {
      if (message.trim().length < 5) {
        return setError("Please write a longer message.");
      }
    }

    startTransition(async () => {
      try {
        const payload = isReferral
          ? {
              kind: "orphan_referral",
              name: name.trim(),
              email: email.trim(),
              message: message.trim(),
              orphan: {
                relationship:
                  RELATIONSHIPS.find((r) => r.value === relationship)?.label ??
                  relationship,
                childFirstName: childFirstName.trim(),
                childAge: childAge.trim(),
                childLocation: childLocation.trim(),
                description: orphanDescription.trim(),
              },
            }
          : {
              kind: "contact",
              name: name.trim(),
              email: email.trim(),
              subject,
              message: message.trim(),
            };

        const r = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!r.ok || !j.ok) {
          setError(
            j.error ??
              "Sorry, we couldn't send your message right now. Please email us directly at support@orphangive.org.",
          );
          return;
        }
        setStatus("submitted");
      } catch {
        setError(
          "Sorry, we couldn't send your message right now. Please email us directly at support@orphangive.org.",
        );
      }
    });
  }

  if (status === "submitted") {
    const referralSuccess =
      "Thank you for telling us about this child. Our admin team will call you within a few business days to discuss next steps. We treat every referral with care and confidentiality.";
    const generalSuccess =
      "We've received your message and will respond within two business days. If it's urgent, drop a note to support@orphangive.org directly.";
    return (
      <div
        className="rounded-2xl border border-tangerine-soft bg-tangerine-mist/40 px-6 py-7 text-center"
        role="status"
      >
        <div className="font-display font-semibold text-xl text-ink">
          Thanks{name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ""}.
        </div>
        <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-md mx-auto">
          {isReferral ? referralSuccess : generalSuccess}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
        <div>
          <label htmlFor="contact-name" className={labelClass}>
            Your name
          </label>
          <input
            id="contact-name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className={labelClass}>
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
            disabled={pending}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-subject" className={labelClass}>
          Subject
        </label>
        <select
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value as SubjectValue)}
          disabled={pending}
          className={inputClass}
        >
          {SUBJECTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Session 32 — conditional orphan-referral fields. Only
          appear when "I know an orphan" is selected. Hidden
          fields don't post values, so the API route's branch on
          `kind === "orphan_referral"` is the source of truth. */}
      {isReferral ? (
        <div className="rounded-2xl border border-tangerine-soft bg-tangerine-mist/30 px-5 py-5 space-y-4">
          <p className="text-sm text-ink-soft leading-snug">
            Tell us about the child you&apos;re referring. Our admin
            team will call you to discuss next steps. We treat every
            referral with care and confidentiality.
          </p>
          <div>
            <label htmlFor="orphan-relationship" className={labelClass}>
              Your relationship to the child
            </label>
            <select
              id="orphan-relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              disabled={pending}
              className={inputClass}
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
            <div>
              <label htmlFor="orphan-name" className={labelClass}>
                Child&apos;s first name
              </label>
              <input
                id="orphan-name"
                type="text"
                value={childFirstName}
                onChange={(e) => setChildFirstName(e.target.value)}
                disabled={pending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="orphan-age" className={labelClass}>
                Child&apos;s approximate age
              </label>
              <input
                id="orphan-age"
                type="text"
                placeholder="e.g. 7"
                value={childAge}
                onChange={(e) => setChildAge(e.target.value)}
                disabled={pending}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="orphan-location" className={labelClass}>
              Child&apos;s location (city / division)
            </label>
            <input
              id="orphan-location"
              type="text"
              placeholder="e.g. Chittagong"
              value={childLocation}
              onChange={(e) => setChildLocation(e.target.value)}
              disabled={pending}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="orphan-description" className={labelClass}>
              Brief description of the situation
            </label>
            <textarea
              id="orphan-description"
              rows={4}
              placeholder="Help us understand the child's circumstances..."
              value={orphanDescription}
              onChange={(e) => setOrphanDescription(e.target.value)}
              disabled={pending}
              className={`${inputClass} resize-y`}
            />
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor="contact-message" className={labelClass}>
          {isReferral ? "Anything else? (optional)" : "Message"}
        </label>
        <textarea
          id="contact-message"
          required={!isReferral}
          rows={isReferral ? 4 : 6}
          placeholder={
            isReferral
              ? "Anything else you'd like our team to know."
              : "What can we help with?"
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={pending}
          className={`${inputClass} resize-y`}
        />
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-[#A02B2B]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-orange-solid text-white font-body font-semibold py-3 px-7 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {pending ? "Sending…" : (
          <>
            {isReferral ? "Submit referral" : "Send message"}
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-200 group-hover:translate-x-1"
            >
              →
            </span>
          </>
        )}
      </button>
    </form>
  );
}

export default ContactForm;
