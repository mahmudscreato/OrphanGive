"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type RecentSponsorship = {
  id: string;
  status:
    | "pending_payment"
    | "active"
    | "paused"
    | "cancelled"
    | "completed"
    | "failed";
  payment_mode: "monthly" | "one_time";
  amount_usd: number;
  started_at: string | null;
  next_billing_date: string | null;
  child: { id: string; display_name: string | null } | null;
};

type Props = {
  expectedIds: string[];
  donorFirstName: string;
  donorEmail: string;
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15; // 15 × 2s = 30s

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function SuccessPoller({
  expectedIds,
  donorFirstName,
  donorEmail,
}: Props) {
  const [rows, setRows] = useState<RecentSponsorship[]>([]);
  const [polls, setPolls] = useState(0);
  const [allActive, setAllActive] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (expectedIds.length === 0) {
      setTimedOut(true);
      return;
    }
    let cancelled = false;
    let pollCount = 0;

    async function tick() {
      pollCount += 1;
      try {
        const res = await fetch("/api/sponsorships/recent", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Bad response");
        const json = (await res.json()) as { sponsorships: RecentSponsorship[] };
        if (cancelled) return;
        const list = Array.isArray(json.sponsorships) ? json.sponsorships : [];
        const matched = list.filter((s) => expectedIds.includes(s.id));
        setRows(matched);
        setPolls(pollCount);
        const everyActive =
          matched.length === expectedIds.length &&
          matched.every((s) => s.status === "active");
        if (everyActive) {
          setAllActive(true);
          return;
        }
        if (pollCount >= MAX_POLLS) {
          setTimedOut(true);
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        if (pollCount >= MAX_POLLS) {
          setTimedOut(true);
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    tick();
    return () => {
      cancelled = true;
    };
  }, [expectedIds]);

  // ── Success state ──────────────────────────────────────────────────────────
  if (allActive) {
    const count = rows.length;
    return (
      <div className="space-y-7">
        <Confetti />
        <div className="text-center">
          <div
            className="mx-auto w-20 h-20 rounded-full bg-moss-soft text-moss flex items-center justify-center"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10">
              <path
                d="M5 13l4 4 10-10"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="font-display font-normal mt-7 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,3.75vw,3rem)]">
            Thank you, {donorFirstName}.
          </h1>
          <p className="mt-3 text-[16px] text-slate leading-[1.65] max-w-[480px] mx-auto">
            You&apos;ve started {count} sponsorship{count === 1 ? "" : "s"}.
            That&apos;s a relationship that begins today.
          </p>
        </div>

        <ul className="space-y-3">
          {rows.map((s) => (
            <li
              key={s.id}
              className="rounded-[18px] bg-white border border-ink/[0.06] px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[15px] text-ink">
                  <span className="font-medium">
                    {s.child?.display_name ?? "Child"}
                  </span>
                  <span className="text-slate-soft mx-2">·</span>
                  <span className="text-slate">
                    {formatUsd(s.amount_usd)}
                    {s.payment_mode === "monthly" ? "/month" : " one-time"}
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border bg-moss-soft text-moss border-moss/30">
                Active
              </span>
            </li>
          ))}
        </ul>

        <div className="text-center pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-7 py-[14px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px"
          >
            View dashboard →
          </Link>
          <p className="mt-5 text-[12.5px] text-slate-soft">
            A receipt has been emailed to {donorEmail}.
          </p>
        </div>
      </div>
    );
  }

  // ── Timeout state ──────────────────────────────────────────────────────────
  if (timedOut) {
    return (
      <div className="text-center space-y-5">
        <div
          className="mx-auto w-16 h-16 rounded-full bg-tangerine-mist text-tangerine-deep flex items-center justify-center"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.25vw,2.25rem)]">
          Still processing…
        </h1>
        <p className="text-[15px] text-slate leading-[1.65] max-w-[440px] mx-auto">
          Your payment went through. We&apos;re finalizing the sponsorship —
          this usually takes only a few seconds, but can occasionally run
          longer. You&apos;ll see it in your dashboard once it&apos;s active.
        </p>
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-ink text-cream px-7 py-[14px] text-[15px] hover:opacity-90 transition-opacity"
          >
            Go to dashboard →
          </Link>
        </div>
        <p className="text-[12.5px] text-slate-soft">
          A receipt has been emailed to {donorEmail}.
        </p>
      </div>
    );
  }

  // ── Polling state ──────────────────────────────────────────────────────────
  return (
    <div className="text-center space-y-5">
      <div
        className="mx-auto w-16 h-16 rounded-full border-2 border-tangerine/30 border-t-tangerine animate-spin"
        aria-hidden="true"
      />
      <h1 className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.25vw,2.25rem)]">
        Finalizing your sponsorship{expectedIds.length === 1 ? "" : "s"}…
      </h1>
      <p className="text-[15px] text-slate leading-[1.65] max-w-[440px] mx-auto">
        Your payment was accepted. We&apos;re activating things now.
      </p>
      <p className="font-mono text-[10.5px] text-slate-soft tracking-[0.14em] uppercase">
        Checked {polls} of {MAX_POLLS}
      </p>
    </div>
  );
}

// Tiny CSS-driven confetti — no external deps. Renders 24 falling pieces.
function Confetti() {
  const pieces = Array.from({ length: 24 });
  const colors = ["#F5821F", "#E8742A", "#7A9B5C", "#FFC8A0", "#FBE9D2"];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden z-50"
    >
      {pieces.map((_, i) => {
        const left = (i * 4.17) % 100; // spread across viewport
        const delay = (i % 8) * 0.15;
        const duration = 2.4 + (i % 5) * 0.3;
        const color = colors[i % colors.length];
        const size = 6 + (i % 3) * 3;
        const rot = (i * 37) % 360;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "-20px",
              left: `${left}%`,
              width: `${size}px`,
              height: `${size * 1.4}px`,
              background: color,
              transform: `rotate(${rot}deg)`,
              animation: `og-confetti-fall ${duration}s ease-in ${delay}s forwards`,
              opacity: 0.9,
              borderRadius: "1px",
            }}
          />
        );
      })}
      <style>{`
        @keyframes og-confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default SuccessPoller;
