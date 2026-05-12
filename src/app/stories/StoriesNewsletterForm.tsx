"use client";

import { useState, type FormEvent } from "react";

/**
 * Session 20 — Stories newsletter signup form (UI only).
 *
 * Captures name + email; submission renders a quiet success state.
 * No backend wired — see TODO below. Form does NOT POST anywhere;
 * the click is intercepted client-side and the success state is
 * cosmetic. We render a clear confirmation copy so the user
 * doesn't feel ignored, but until the backend lands the data is
 * not stored.
 */
export function StoriesNewsletterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitted">("idle");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // TODO: wire to newsletter list (Mailchimp / Buttondown /
    // Directus subscribers collection — TBD with Mahmud).
    // For now, surface a success state without persisting.
    if (!email.includes("@")) return;
    setStatus("submitted");
  }

  if (status === "submitted") {
    return (
      <div
        className="rounded-2xl border border-tangerine-soft bg-tangerine-mist/40 px-6 py-5 text-center"
        role="status"
      >
        <div className="font-display font-semibold text-lg text-ink">
          Thanks{name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ""}.
        </div>
        <p className="mt-1 text-sm text-ink-soft leading-relaxed">
          We&apos;ll let you know the moment the first stories are
          published.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 max-w-md mx-auto">
      <label className="sr-only" htmlFor="story-newsletter-name">
        Your name
      </label>
      <input
        id="story-newsletter-name"
        type="text"
        autoComplete="name"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-full border border-ink/[0.12] bg-white px-5 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
      />
      <label className="sr-only" htmlFor="story-newsletter-email">
        Email address
      </label>
      <input
        id="story-newsletter-email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-full border border-ink/[0.12] bg-white px-5 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
      />
      <button
        type="submit"
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-orange-solid text-white font-body font-semibold py-3 px-6 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px"
      >
        Notify me when stories arrive
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

export default StoriesNewsletterForm;
