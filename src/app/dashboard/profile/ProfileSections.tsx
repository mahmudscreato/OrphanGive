"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  COUNTRIES,
  COUNTRY_BY_CODE,
  DEFAULT_COUNTRY_CODE,
} from "@/lib/countries";
import { useToast } from "@/components/ui/Toast";
import { signOutAction } from "@/app/(auth)/actions";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium";
const errorClass = "mt-1.5 text-[12px] text-[#D04848]";
const cardClass =
  "rounded-[20px] bg-white border border-ink/[0.06] px-7 py-6 max-md:px-5 max-md:py-5";
const sectionLabelClass =
  "font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ProfileSectionsDonor = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  og_country: string | null;
  og_phone: string | null;
  og_profile_photo_url: string | null;
  og_agreed_to_terms_at: string | null;
};

export function ProfileSections({ donor }: { donor: ProfileSectionsDonor }) {
  return (
    <div className="space-y-6">
      <PersonalSection donor={donor} />
      <SecuritySection />
      <AccountSection />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PERSONAL INFORMATION
// ═══════════════════════════════════════════════════════════════

function PersonalSection({ donor }: { donor: ProfileSectionsDonor }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const initialCountry =
    (donor.og_country &&
      COUNTRY_BY_CODE[donor.og_country.toUpperCase()] &&
      donor.og_country.toUpperCase()) ||
    DEFAULT_COUNTRY_CODE;

  const [photoUrl, setPhotoUrl] = useState<string | null>(
    donor.og_profile_photo_url,
  );
  const [firstName, setFirstName] = useState(donor.first_name ?? "");
  const [lastName, setLastName] = useState(donor.last_name ?? "");
  const [country, setCountry] = useState(initialCountry);
  const [phone, setPhone] = useState(donor.og_phone ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const dirty =
    firstName.trim() !== (donor.first_name ?? "").trim() ||
    lastName.trim() !== (donor.last_name ?? "").trim() ||
    country !== initialCountry ||
    phone.trim() !== (donor.og_phone ?? "").trim();

  function onSave() {
    setServerError(null);
    setErrors({});

    const localErrors: Record<string, string> = {};
    if (!firstName.trim()) localErrors.first_name = "First name is required.";
    if (!lastName.trim()) localErrors.last_name = "Last name is required.";
    if (!country) localErrors.country = "Country is required.";
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/donor/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            country,
            phone: phone.trim(),
          }),
        });
        const json: { success?: boolean; error?: string; field?: string } =
          await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          if (json.field) {
            setErrors({ [json.field]: json.error ?? "Invalid value." });
          } else {
            setServerError(json.error ?? "Could not save. Please try again.");
          }
          return;
        }
        toast.success("Profile saved.");
        router.refresh();
      } catch {
        setServerError("Network error. Please try again.");
      }
    });
  }

  return (
    <section className={cardClass}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
        <h2 className="font-display text-[20px] text-ink leading-tight m-0">
          Personal information
        </h2>
        <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate-soft">
          Section 1 of 3
        </span>
      </div>

      <div className="flex items-start gap-6 mb-7 max-md:flex-col">
        <ProfilePhotoControl
          donorId={donor.id}
          firstNameInitial={(firstName || donor.email)[0]?.toUpperCase() ?? "?"}
          photoUrl={photoUrl}
          setPhotoUrl={setPhotoUrl}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] text-slate leading-[1.6] max-w-[420px]">
            Add a photo so the team knows who you are. Optional —
            JPG, PNG or WebP, up to 5&nbsp;MB.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
        <Field
          label="First name"
          htmlFor="first_name"
          error={errors.first_name}
        >
          <input
            id="first_name"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
            disabled={pending}
            maxLength={80}
          />
        </Field>
        <Field
          label="Last name"
          htmlFor="last_name"
          error={errors.last_name}
        >
          <input
            id="last_name"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
            disabled={pending}
            maxLength={80}
          />
        </Field>

        <Field label="Country" htmlFor="country" error={errors.country}>
          <select
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={`${inputClass} appearance-none bg-white pr-10`}
            disabled={pending}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone} optional>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            disabled={pending}
            placeholder="+880 1XXXXXXXXX"
            maxLength={40}
          />
        </Field>

        <div className="col-span-2 max-md:col-span-1">
          <ReadOnlyField label="Email">
            <span>{donor.email}</span>
            <a
              href="mailto:support@orphangive.org?subject=Email%20change%20request"
              className="ml-3 text-[12px] text-tangerine-deeper underline-offset-4 hover:underline"
            >
              To change your email, contact support →
            </a>
          </ReadOnlyField>
        </div>
        <div className="col-span-2 max-md:col-span-1">
          <ReadOnlyField label="Member since">
            {formatMemberSince(donor)}
          </ReadOnlyField>
        </div>
      </div>

      {serverError ? (
        <div className="mt-5 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[14px] text-[#A02B2B]">
          {serverError}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || pending}
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-7 py-3 text-[14px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </section>
  );
}

function ProfilePhotoControl({
  donorId,
  firstNameInitial,
  photoUrl,
  setPhotoUrl,
}: {
  donorId: string;
  firstNameInitial: string;
  photoUrl: string | null;
  setPhotoUrl: (v: string | null) => void;
}) {
  void donorId;
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function uploadFile(file: File) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      toast.error("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Image is over 5 MB. Please choose a smaller file.");
      return;
    }

    setBusy(true);
    try {
      // 1) Get a signed upload from our server.
      const sigRes = await fetch(
        "/api/donor/me/profile-photo/upload-signature",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const sigJson: {
        cloudName?: string;
        apiKey?: string;
        timestamp?: number;
        folder?: string;
        signature?: string;
        error?: string;
      } = await sigRes.json().catch(() => ({}));
      if (
        !sigRes.ok ||
        !sigJson.cloudName ||
        !sigJson.apiKey ||
        !sigJson.signature ||
        !sigJson.timestamp
      ) {
        toast.error(sigJson.error ?? "Could not start upload.");
        return;
      }

      // 2) POST the file directly to Cloudinary.
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sigJson.apiKey);
      fd.append("timestamp", String(sigJson.timestamp));
      fd.append("signature", sigJson.signature);
      if (sigJson.folder) fd.append("folder", sigJson.folder);
      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sigJson.cloudName}/image/upload`,
        { method: "POST", body: fd },
      );
      const upJson: { secure_url?: string; error?: { message?: string } } =
        await upRes.json().catch(() => ({}));
      if (!upRes.ok || !upJson.secure_url) {
        toast.error(upJson.error?.message ?? "Cloudinary upload failed.");
        return;
      }

      // 3) Save the secure_url to the donor row.
      const saveRes = await fetch("/api/donor/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_photo_url: upJson.secure_url }),
      });
      const saveJson: { success?: boolean; error?: string } = await saveRes
        .json()
        .catch(() => ({}));
      if (!saveRes.ok || !saveJson.success) {
        toast.error(saveJson.error ?? "Could not save photo.");
        return;
      }

      setPhotoUrl(upJson.secure_url);
      toast.success("Photo updated.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      const res = await fetch("/api/donor/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_photo_url: null }),
      });
      const json: { success?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Could not remove photo.");
        return;
      }
      setPhotoUrl(null);
      toast.success("Photo removed.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="relative w-24 h-24 rounded-full overflow-hidden bg-moss-soft border border-ink/[0.06] flex items-center justify-center">
        {photoUrl ? (
          // Cloudinary URL — `next/image` not configured for it; tiny avatar
          // doesn't benefit from optimization. Plain <img> is fine here.
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-display text-[36px] text-moss">
            {firstNameInitial}
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await uploadFile(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="font-body text-[12.5px] text-tangerine-deeper underline-offset-4 hover:underline disabled:opacity-50"
        >
          {photoUrl ? "Change" : "Upload photo"}
        </button>
        {photoUrl ? (
          <>
            <span className="text-slate-soft">·</span>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="font-body text-[12.5px] text-slate hover:text-[#D04848] disabled:opacity-50"
            >
              Remove
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECURITY (password change)
// ═══════════════════════════════════════════════════════════════

function SecuritySection() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const localErrors: Record<string, string> = {};
    if (!current) localErrors.currentPassword = "Current password is required.";
    if (next.length < 8)
      localErrors.newPassword = "Password must be at least 8 characters.";
    if (next !== confirm)
      localErrors.confirmPassword = "Passwords don't match.";
    if (next && current === next)
      localErrors.newPassword =
        "New password must be different from current password.";
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      try {
        const res = await fetch("/api/donor/me/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: current,
            newPassword: next,
          }),
        });
        const json: { success?: boolean; error?: string; field?: string } =
          await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          if (json.field) {
            setErrors({ [json.field]: json.error ?? "Invalid value." });
          } else {
            setServerError(
              json.error ?? "Could not update password. Please try again.",
            );
          }
          return;
        }
        toast.success("Password updated.");
        setCurrent("");
        setNext("");
        setConfirm("");
      } catch {
        setServerError("Network error. Please try again.");
      }
    });
  }

  const strengthHint = passwordStrengthHint(next);

  return (
    <section className={cardClass}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
        <h2 className="font-display text-[20px] text-ink leading-tight m-0">
          Security
        </h2>
        <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate-soft">
          Section 2 of 3
        </span>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
        <div className="col-span-2">
          <Field
            label="Current password"
            htmlFor="current_password"
            error={errors.currentPassword}
          >
            <input
              id="current_password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
              disabled={pending}
            />
          </Field>
        </div>

        <Field
          label="New password"
          htmlFor="new_password"
          error={errors.newPassword}
          hint={strengthHint}
        >
          <input
            id="new_password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputClass}
            disabled={pending}
            minLength={8}
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="confirm_password"
          error={errors.confirmPassword}
        >
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            disabled={pending}
            minLength={8}
          />
        </Field>

        {serverError ? (
          <div className="col-span-2 max-md:col-span-1 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[14px] text-[#A02B2B]">
            {serverError}
          </div>
        ) : null}

        <div className="col-span-2 max-md:col-span-1 flex justify-end">
          <button
            type="submit"
            disabled={pending || !current || !next || !confirm}
            className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-7 py-3 text-[14px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {pending ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}

function passwordStrengthHint(pw: string): string | null {
  if (!pw) return "8+ characters; mixing letters and numbers is best.";
  if (pw.length < 8) return `${pw.length}/8 characters minimum`;
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  const hasSymbol = /[^a-zA-Z\d]/.test(pw);
  const score = [hasLetter, hasNumber, hasSymbol].filter(Boolean).length;
  if (score >= 3 && pw.length >= 12) return "Strong.";
  if (score >= 2 && pw.length >= 10) return "Good.";
  return "Acceptable. Consider adding a number or symbol.";
}

// ═══════════════════════════════════════════════════════════════
// ACCOUNT (sign out, delete contact link)
// ═══════════════════════════════════════════════════════════════

function AccountSection() {
  return (
    <section className={cardClass}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-5">
        <h2 className="font-display text-[20px] text-ink leading-tight m-0">
          Account
        </h2>
        <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate-soft">
          Section 3 of 3
        </span>
      </div>

      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-ink text-cream px-6 py-2.5 text-[13.5px] transition-all duration-[250ms] ease-soft hover:bg-tangerine hover:text-ink hover:shadow-warm hover:-translate-y-px"
        >
          Sign out
        </button>
      </form>

      <p className="mt-6 text-[13.5px] text-slate-soft leading-[1.6]">
        Need to delete your account?{" "}
        <a
          href="mailto:support@orphangive.org?subject=Account%20deletion%20request"
          className="text-tangerine-deeper underline-offset-4 hover:underline"
        >
          Contact us at support@orphangive.org →
        </a>
      </p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Atoms
// ═══════════════════════════════════════════════════════════════

function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string | null;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={htmlFor}>
        {label}
        {optional ? (
          <span className="ml-2 normal-case tracking-normal text-slate-soft font-normal">
            (optional)
          </span>
        ) : null}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className={errorClass}>{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-slate-soft">{hint}</p>
      ) : null}
    </div>
  );
}

function ReadOnlyField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={sectionLabelClass}>{label}</div>
      <div className="mt-2 text-[15px] text-ink">{children}</div>
    </div>
  );
}

function formatMemberSince(d: ProfileSectionsDonor): string {
  const iso = d.og_agreed_to_terms_at;
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}
