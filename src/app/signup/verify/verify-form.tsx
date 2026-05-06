"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

const RESEND_COOLDOWN_SEC = 60;

export function VerifyForm({ initialEmail }: { initialEmail: string }) {
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
        router.push("/signup/pending");
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
        <div className="mt-5 rounded-xl bg-tangerine-mist border border-tangerine-soft px-4 py-3 text-[14px] text-tangerine-deep">
          {resendNotice}
        </div>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-8 py-[15px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Verifying…" : "Verify code →"}
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={resendCooldown > 0 || resendPending}
          className="text-[13px] text-slate hover:text-tangerine-deep disabled:text-slate-soft disabled:cursor-not-allowed underline-offset-4 hover:underline"
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
