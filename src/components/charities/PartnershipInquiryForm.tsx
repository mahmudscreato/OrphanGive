// P4 — partnership reach-out form for /for-charities.
//
// Client component. Validates client-side for instant UX and reposts
// the same shape server-side via /api/partnership-inquiry. Server is
// authoritative.
//
// Spam control:
//   - Honeypot: a hidden `website` input. Real users can't see it
//     (off-screen + aria-hidden). Bots auto-fill it; the server
//     silently accepts but doesn't persist.
//   - Rate limit: enforced server-side (per-IP sliding window).
//
// Privacy: nothing about this form gets logged client-side. We
// don't send analytics events for the submit. The success state is
// inline + dignified.

"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

const INQUIRY_TYPE_OPTIONS = [
  { value: "offer_help", label: "I can offer help — fund or support a child" },
  { value: "need_help", label: "We're an NGO seeking sponsorship for children we serve" },
  { value: "partner", label: "Partnership or collaboration" },
  { value: "other", label: "Other" },
] as const;

interface FormState {
  organisation_name: string;
  contact_name: string;
  role: string;
  email: string;
  phone: string;
  inquiry_type: (typeof INQUIRY_TYPE_OPTIONS)[number]["value"] | "";
  message: string;
  website: string; // honeypot
}

function blank(): FormState {
  return {
    organisation_name: "",
    contact_name: "",
    role: "",
    email: "",
    phone: "",
    inquiry_type: "",
    message: "",
    website: "",
  };
}

const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const textareaClass = `${inputClass} min-h-[140px] resize-y leading-relaxed`;
const selectClass = inputClass;
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

export function PartnershipInquiryForm() {
  const [form, setForm] = useState<FormState>(blank);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!e[k as string]) return e;
      const next = { ...e };
      delete next[k as string];
      return next;
    });
  }

  function clientValidate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.organisation_name.trim()) e.organisation_name = "Required.";
    if (form.organisation_name.length > 200) e.organisation_name = "Too long.";
    if (!form.contact_name.trim()) e.contact_name = "Required.";
    if (form.contact_name.length > 100) e.contact_name = "Too long.";
    if (!form.role.trim()) e.role = "Required.";
    if (form.role.length > 100) e.role = "Too long.";
    if (!form.email.trim()) e.email = "Required.";
    // Quick shape check — server enforces with proper validator.
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = "Looks like an invalid email.";
    }
    if (form.phone && !/^[\d\s+\-()]*$/.test(form.phone)) {
      e.phone = "Invalid characters.";
    }
    if (!form.inquiry_type) e.inquiry_type = "Pick one.";
    const msg = form.message.trim();
    if (msg.length < 20) e.message = "Tell us a little more (20+ characters).";
    if (msg.length > 2000) e.message = "Too long — keep it under 2000 characters.";
    return e;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const local = clientValidate();
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    setErrors({});

    startTransition(async () => {
      try {
        const res = await fetch("/api/partnership-inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_name: form.organisation_name,
            contact_name: form.contact_name,
            role: form.role,
            email: form.email,
            phone: form.phone || undefined,
            inquiry_type: form.inquiry_type,
            message: form.message,
            // Honeypot — pass through (server ignores when empty).
            website: form.website,
            source: "for-charities",
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          field?: string;
          message?: string;
        };
        if (res.ok && body.ok) {
          setSubmitted(true);
          setForm(blank());
          return;
        }
        if (body.error === "invalid_input" && body.field) {
          setErrors({
            [body.field]: body.message ?? "Invalid value.",
          });
        } else if (body.error === "rate_limited") {
          setServerError(
            "We're getting a lot of submissions. Try again in a little while.",
          );
        } else {
          setServerError(
            "Something went wrong. Please try again, or email support@orphangive.org.",
          );
        }
      } catch {
        setServerError("Network error. Please try again.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="max-w-[560px] mx-auto mt-6 rounded-2xl bg-white border border-moss/30 px-6 py-7 text-left">
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="w-5 h-5 text-moss-deep stroke-[2] mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="font-display text-[20px] text-ink leading-tight mb-1.5">
              Thank you — we&apos;ve received your note.
            </p>
            <p className="text-[14px] text-ink-soft leading-relaxed">
              Our partnership team reviews every inquiry within two
              business days. You&apos;ll hear from us at the email you
              provided. If it&apos;s urgent, write to{" "}
              <a
                href="mailto:support@orphangive.org"
                className="text-tangerine-deeper underline-offset-2 hover:underline"
              >
                support@orphangive.org
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="max-w-[560px] mx-auto mt-6 rounded-2xl bg-white px-6 py-7 max-md:px-5 max-md:py-6 shadow-md text-left space-y-4"
      aria-labelledby="partnership-form-heading"
    >
      <h3
        id="partnership-form-heading"
        className="font-display text-[20px] text-ink leading-tight"
      >
        Tell us about your organisation
      </h3>

      <div>
        <label htmlFor="org-name" className={labelClass}>
          Organisation name *
        </label>
        <input
          id="org-name"
          type="text"
          className={inputClass}
          value={form.organisation_name}
          onChange={(e) => set("organisation_name", e.target.value)}
          maxLength={200}
          disabled={pending}
          autoComplete="organization"
          aria-invalid={errors.organisation_name ? true : undefined}
        />
        {errors.organisation_name ? (
          <p className={errorClass}>{errors.organisation_name}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div>
          <label htmlFor="contact-name" className={labelClass}>
            Your name *
          </label>
          <input
            id="contact-name"
            type="text"
            className={inputClass}
            value={form.contact_name}
            onChange={(e) => set("contact_name", e.target.value)}
            maxLength={100}
            disabled={pending}
            autoComplete="name"
            aria-invalid={errors.contact_name ? true : undefined}
          />
          {errors.contact_name ? (
            <p className={errorClass}>{errors.contact_name}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="role" className={labelClass}>
            Your role *
          </label>
          <input
            id="role"
            type="text"
            className={inputClass}
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
            placeholder="e.g. Director"
            maxLength={100}
            disabled={pending}
            autoComplete="organization-title"
            aria-invalid={errors.role ? true : undefined}
          />
          {errors.role ? <p className={errorClass}>{errors.role}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div>
          <label htmlFor="email" className={labelClass}>
            Work email *
          </label>
          <input
            id="email"
            type="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={254}
            disabled={pending}
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
          />
          {errors.email ? <p className={errorClass}>{errors.email}</p> : null}
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone (optional)
          </label>
          <input
            id="phone"
            type="tel"
            className={inputClass}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+880 …"
            maxLength={32}
            disabled={pending}
            autoComplete="tel"
            aria-invalid={errors.phone ? true : undefined}
          />
          {errors.phone ? <p className={errorClass}>{errors.phone}</p> : null}
        </div>
      </div>

      <div>
        <label htmlFor="inquiry-type" className={labelClass}>
          What brings you here? *
        </label>
        <select
          id="inquiry-type"
          className={selectClass}
          value={form.inquiry_type}
          onChange={(e) => set("inquiry_type", e.target.value as FormState["inquiry_type"])}
          disabled={pending}
          aria-invalid={errors.inquiry_type ? true : undefined}
        >
          <option value="">Select…</option>
          {INQUIRY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {errors.inquiry_type ? (
          <p className={errorClass}>{errors.inquiry_type}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="message" className={labelClass}>
          A short note *
        </label>
        <textarea
          id="message"
          className={textareaClass}
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          placeholder="What's your organisation, who you serve, and what you're hoping a partnership could unlock."
          maxLength={2000}
          disabled={pending}
          aria-invalid={errors.message ? true : undefined}
        />
        <p className={helperClass}>
          {form.message.length}/2000 characters
        </p>
        {errors.message ? (
          <p className={errorClass}>{errors.message}</p>
        ) : null}
      </div>

      {/* Honeypot — hidden from humans, visible to bots. Off-screen
          (not display:none — many bots skip display:none fields).
          aria-hidden + tabindex=-1 so screen readers / keyboard users
          ignore it too. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "auto",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label htmlFor="website">Website (leave blank)</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => set("website", e.target.value)}
        />
      </div>

      {serverError ? (
        <div
          role="alert"
          className="rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
        >
          {serverError}
        </div>
      ) : null}

      <div className="pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-tangerine text-white font-semibold px-6 py-3 text-[14px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            <>Send inquiry</>
          )}
        </button>
        <p className="mt-3 text-[12px] text-ink-soft leading-relaxed">
          We reply within two business days. By submitting, you confirm
          you&apos;re an adult acting on behalf of an organisation.
        </p>
      </div>
    </form>
  );
}
