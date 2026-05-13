"use client";

// Session 32 — volunteer application form. Posts to the same
// /api/contact route as the contact form, with `kind="volunteer"`
// discriminator. Sends to support@orphangive.org via Resend.

import { useState, useTransition, type FormEvent } from "react";

const SKILL_OPTIONS = [
  { value: "field_verification", label: "Field verification (Bangladesh)" },
  { value: "content_translation", label: "Content & translation (Bangla / English / Arabic)" },
  { value: "design_dev", label: "Design & development (remote)" },
  { value: "photo_video", label: "Photography & video" },
  { value: "event_coordination", label: "Event coordination" },
  { value: "fundraising", label: "Fundraising" },
  { value: "outreach", label: "Outreach & community" },
  { value: "other", label: "Other" },
] as const;

const AVAILABILITY = [
  { value: "few_per_week", label: "A few hours per week" },
  { value: "few_per_month", label: "A few hours per month" },
  { value: "project", label: "Project-based" },
  { value: "flexible", label: "Flexible" },
  { value: "full_time", label: "Full-time" },
] as const;

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200";

const labelClass = "block text-sm font-medium text-ink mb-1.5";

export function VolunteerForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillsOther, setSkillsOther] = useState("");
  const [availability, setAvailability] = useState<string>(AVAILABILITY[0].value);
  const [motivation, setMotivation] = useState("");
  const [status, setStatus] = useState<"idle" | "submitted">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const showOtherSkill = skills.includes("other");

  function toggleSkill(value: string) {
    setSkills((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please tell us your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError("Please enter a valid email address.");
    }
    if (!location.trim()) return setError("Location is required.");
    if (skills.length === 0) {
      return setError("Pick at least one skill or interest.");
    }
    if (showOtherSkill && !skillsOther.trim()) {
      return setError("Tell us what 'Other' means to you.");
    }

    startTransition(async () => {
      try {
        const labelledSkills = skills.map(
          (v) => SKILL_OPTIONS.find((o) => o.value === v)?.label ?? v,
        );
        const payload = {
          kind: "volunteer",
          name: name.trim(),
          email: email.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          location: location.trim(),
          skills: labelledSkills,
          ...(showOtherSkill ? { skillsOther: skillsOther.trim() } : {}),
          availability:
            AVAILABILITY.find((a) => a.value === availability)?.label ??
            availability,
          ...(motivation.trim() ? { motivation: motivation.trim() } : {}),
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
              "Sorry, we couldn't send your application right now. Please email us directly at support@orphangive.org.",
          );
          return;
        }
        setStatus("submitted");
      } catch {
        setError(
          "Sorry, we couldn't send your application right now. Please email us directly at support@orphangive.org.",
        );
      }
    });
  }

  if (status === "submitted") {
    return (
      <div
        className="rounded-2xl border border-tangerine-soft bg-tangerine-mist/40 px-6 py-7 text-center"
        role="status"
      >
        <div className="font-display font-semibold text-xl text-ink">
          Thank you for your interest{name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ""}.
        </div>
        <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-md mx-auto">
          Our team will reach out within a few business days. If you
          have anything else to share in the meantime, write to{" "}
          <a
            href="mailto:support@orphangive.org"
            className="text-tangerine-deep font-medium hover:underline"
          >
            support@orphangive.org
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
        <div>
          <label htmlFor="vol-name" className={labelClass}>
            Full name
          </label>
          <input
            id="vol-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="vol-email" className={labelClass}>
            Email
          </label>
          <input
            id="vol-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
        <div>
          <label htmlFor="vol-phone" className={labelClass}>
            Phone (optional)
          </label>
          <input
            id="vol-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={pending}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="vol-location" className={labelClass}>
            Location (city / division)
          </label>
          <input
            id="vol-location"
            type="text"
            placeholder="e.g. Dhaka, Bangladesh"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={pending}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset>
        <legend className={labelClass}>Skills & interests</legend>
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-x-4 gap-y-2">
          {SKILL_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer"
            >
              <input
                type="checkbox"
                checked={skills.includes(opt.value)}
                onChange={() => toggleSkill(opt.value)}
                disabled={pending}
                className="mt-1 accent-tangerine"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
        {showOtherSkill ? (
          <input
            type="text"
            placeholder="Tell us about your 'other' skill"
            value={skillsOther}
            onChange={(e) => setSkillsOther(e.target.value)}
            disabled={pending}
            className={`${inputClass} mt-3`}
          />
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="vol-availability" className={labelClass}>
          Availability
        </label>
        <select
          id="vol-availability"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          disabled={pending}
          className={inputClass}
        >
          {AVAILABILITY.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="vol-motivation" className={labelClass}>
          Why you want to volunteer (optional)
        </label>
        <textarea
          id="vol-motivation"
          rows={4}
          placeholder="Tell us a bit about why OrphanGive resonates with you..."
          value={motivation}
          onChange={(e) => setMotivation(e.target.value)}
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
            Submit volunteer application
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

export default VolunteerForm;
