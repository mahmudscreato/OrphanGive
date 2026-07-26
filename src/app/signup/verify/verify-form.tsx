"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { establishSession } from "@/app/(auth)/actions";

const RESEND_COOLDOWN_SEC = 60;

// fix/remove-approval-wall — the sign-up form stashes the just-created password
// here so verification can auto-sign-in (Directus login needs it) and resume
// the origin child WITHOUT a separate sign-in step. Read once, then cleared.
const SIGNUP_PW_KEY = "og_signup_pw";

// Only follow same-site relative destinations (guards against open redirects).
function safeNext(next: string | null | undefined): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export function VerifyForm({
  initialEmail,
  next,
}: {
  initialEmail: string;
  next?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resendPending, setResendPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Auto-focus the first empty box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function setDigit(idx: number, val: string) {
    const v = val.replace(/\D/g, "").slice(0, 1);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
    if (v && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const txt = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (txt.length === 0) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < txt.length; i++) next[i] = txt[i]!;
    setDigits(next);
    const focusIdx = Math.min(txt.length, 5);
    inputRefs.current[focusIdx]?.focus();
  }

  function onKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  async function submit() {
    setError(null);
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter all 6 digits.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/donor/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: initialEmail, code }),
        });
        const json: { success?: boolean; error?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok || !json.success) {
          setError(json.error ?? "Invalid or expired code.");
          return;
        }

        // fix/remove-approval-wall — email verified. There is NO approval wall:
        // a verified donor already resolves to getDonorState() === "approved".
        // Auto-sign-in with the password they just set (stashed by the sign-up
        // form) and resume the child sponsor/checkout flow they came from. If
        // the password isn't available (page reload / direct navigation), fall
        // back to a quick sign-in with the email prefilled + the same `next`.
        const dest = safeNext(next);
        const signinFallback = `/signin?${
          dest ? `next=${encodeURIComponent(dest)}&` : ""
        }email=${encodeURIComponent(initialEmail)}`;

        let pw: string | null = null;
        try {
          pw = sessionStorage.getItem(SIGNUP_PW_KEY);
          sessionStorage.removeItem(SIGNUP_PW_KEY);
        } catch {
          /* sessionStorage unavailable — fall through to manual sign-in */
        }

        if (pw) {
          // establishSession sets the session cookies and RETURNS (no server
          // redirect), so we control navigation here — no imperative
          // server-action-redirect ambiguity. On success, resume the origin
          // child flow (dest) or the sensible default (/dashboard for a generic
          // signup). On failure, fall back to a manual sign-in.
          const result = await establishSession(initialEmail, pw);
          router.push("ok" in result ? dest ?? "/dashboard" : signinFallback);
          return;
        }

        router.push(signinFallback);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  async function resend() {
    if (resendCooldown > 0 || resendPending) return;
    setError(null);
    setResendNotice(null);
    setResendPending(true);
    try {
      const res = await fetch("/api/donor/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: initialEmail }),
      });
      const json: { success?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(json.error ?? "Could not resend code.");
      } else {
        setResendNotice("If your account exists, a new code is on the way.");
        setResendCooldown(RESEND_COOLDOWN_SEC);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResendPending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex justify-between gap-2 max-md:gap-1.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            className="w-12 h-14 text-center font-mono text-[24px] tracking-normal rounded-xl border-[1.5px] border-ink/[0.12] bg-white text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 max-md:w-10 max-md:h-12 max-md:text-[20px]"
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>

      {error ? (
        <div className="mt-5 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[14px] text-[#A02B2B]">
          {error}
        </div>
      ) : null}
      {resendNotice ? (
        <div className="mt-5 rounded-xl bg-tangerine-mist border border-tangerine-soft px-4 py-3 text-[14px] text-tangerine-deeper">
          {resendNotice}
        </div>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-8 py-[15px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Verifying…" : "Verify code →"}
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={resendCooldown > 0 || resendPending}
          className="text-[13px] text-slate hover:text-tangerine-deeper disabled:text-slate-soft disabled:cursor-not-allowed underline-offset-4 hover:underline"
        >
          {resendCooldown > 0
            ? `Resend code in ${resendCooldown}s`
            : resendPending
              ? "Sending…"
              : "Resend code"}
        </button>
      </div>
    </form>
  );
}
