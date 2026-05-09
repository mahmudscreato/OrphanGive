"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import {
  CUSTOM_DURATION_MAX,
  CUSTOM_DURATION_MIN,
  isPaymentMode,
  isPaymentSchedule,
  isValidAmount,
  SPONSORSHIP_TIERS,
  type PaymentMode,
  type PaymentSchedule,
} from "@/lib/pricing";
import type { DonorState } from "@/lib/donor-data";
import { ModeSelector } from "@/components/sponsor/ModeSelector";
import { TierGrid } from "@/components/sponsor/TierGrid";
import { AmountInput } from "@/components/sponsor/AmountInput";
import {
  DurationPicker,
  isDurationSelectionValid,
  type DurationSelection,
} from "@/components/sponsor/DurationPicker";
import { PaymentSchedulePicker } from "@/components/sponsor/PaymentSchedulePicker";
import { CausePicker } from "@/components/sponsor/CausePicker";
import { VisibilityPicker } from "@/components/sponsor/VisibilityPicker";
import { SponsorReviewCard } from "@/components/sponsor/SponsorReviewCard";
import { DEFAULT_CAUSE, isValidCause, type CauseEnum } from "@/lib/cause";
import {
  DEFAULT_VISIBILITY,
  isValidVisibility,
  type VisibilityEnum,
} from "@/lib/visibility";

type ChildProps = {
  id: string;
  display_name: string;
  age: number | null;
  district: string | null;
  photo: string | null;
  story: string | null;
  story_truncated: boolean;
};

type Props = {
  child: ChildProps;
  signedIn: boolean;
  donorState: DonorState;
  initialCartItemCount: number;
  // Session 14.6: when true, this child already has an active monthly
  // sponsor (any donor). The 'monthly' tile in step 1 renders disabled
  // and the donor can only build a one-time gift here. The /sponsor
  // server page sets this from getActiveMonthlySponsorForChild.
  monthlyLocked: boolean;
  // Donor's first name (when signed in). Surfaced as a preview in the
  // step 6 'Show my name' option so the donor sees what's about to go
  // public. Null for guests.
  donorFirstName: string | null;
  // Session 14.6 — same-donor exemption: when the active monthly
  // sponsor IS the current donor, monthlyLocked is false and this
  // carries the existing sponsorship's id + end date so the page can
  // show a friendly note and a "Manage your monthly sponsorship →"
  // link instead of silently letting them re-create a duplicate.
  // Null in the normal (no-active-monthly OR locked-by-other-donor)
  // path.
  selfActiveMonthly: {
    sponsorshipId: string;
    scheduledEndDate: string | null;
  } | null;
};

const OTHER_TIER_ID = "other" as const;

// Step machine.
//   1 mode → 2 amount → 3 duration → 4 schedule → 5 cause → 6 visibility → 7 review
// One-time skips 3 and 4. Indefinite monthly skips 4. Cause (5) and
// visibility (6) always render — including for one-time gifts.
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

function pickFirstSentence(s: string | null): string | null {
  if (!s) return null;
  const m = s.trim().match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : s.trim().slice(0, 160);
}

// Derive the DurationSelection from a numeric months value (or null).
// Used when prefilling state from URL search params (edit-from-cart).
function durationSelectionFromMonths(
  months: number | null,
): DurationSelection {
  if (months === null) return { optionId: "d_indef", months: null };
  if (months === 3) return { optionId: "d_3", months: 3 };
  if (months === 6) return { optionId: "d_6", months: 6 };
  if (months === 12) return { optionId: "d_12", months: 12 };
  return { optionId: "d_custom", months };
}

// Pull a prefilled state out of search params if all-required-keys are
// present and valid. Returns null if the URL is a plain visit.
function readPrefilledState(searchParams: URLSearchParams): {
  mode: PaymentMode;
  amount: number;
  duration: DurationSelection;
  schedule: PaymentSchedule | null;
  cause: CauseEnum;
  visibility: VisibilityEnum;
} | null {
  const m = searchParams.get("mode");
  const a = searchParams.get("amount");
  const d = searchParams.get("duration"); // "indef" or integer string
  const s = searchParams.get("schedule"); // optional for one_time / indef
  const cRaw = searchParams.get("cause"); // optional; defaults to general_care
  const vRaw = searchParams.get("visibility"); // optional; defaults to anonymous

  if (!m || !a) return null;
  if (!isPaymentMode(m)) return null;
  const amount = Number(a);
  if (!isValidAmount(m, amount)) return null;

  // Cause is optional in the URL. When provided, it must be a recognised
  // enum; an invalid value rejects the entire prefill (donor lands on
  // step 1 fresh) so we never silently swallow a tampered query string.
  let cause: CauseEnum;
  if (cRaw === null) {
    cause = DEFAULT_CAUSE;
  } else if (isValidCause(cRaw)) {
    cause = cRaw;
  } else {
    return null;
  }

  // Same shape for visibility (Session 14.6) — optional, validated
  // strictly when present, defaults to anonymous (privacy-preserving).
  let visibility: VisibilityEnum;
  if (vRaw === null) {
    visibility = DEFAULT_VISIBILITY;
  } else if (isValidVisibility(vRaw)) {
    visibility = vRaw;
  } else {
    return null;
  }

  if (m === "one_time") {
    return {
      mode: "one_time",
      amount,
      duration: { optionId: "d_indef", months: null },
      schedule: null,
      cause,
      visibility,
    };
  }

  // monthly
  let months: number | null;
  if (d === "indef" || d === null) {
    months = null;
  } else {
    const n = Number(d);
    if (
      !Number.isInteger(n) ||
      n < CUSTOM_DURATION_MIN ||
      n > CUSTOM_DURATION_MAX
    ) {
      return null;
    }
    months = n;
  }
  let schedule: PaymentSchedule;
  if (months === null) {
    schedule = "monthly";
  } else {
    if (!s || !isPaymentSchedule(s)) return null;
    schedule = s;
  }
  return {
    mode: "monthly",
    amount,
    duration: durationSelectionFromMonths(months),
    schedule,
    cause,
    visibility,
  };
}

export function SponsorPageContent({
  child,
  signedIn,
  donorState,
  initialCartItemCount,
  monthlyLocked,
  donorFirstName,
  selfActiveMonthly,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  // ── State machine ─────────────────────────────────────────────────────
  const prefill = useMemo(
    () => readPrefilledState(new URLSearchParams(search.toString())),
    [search],
  );
  const isEditing = search.get("edit") === "1";

  const [mode, setMode] = useState<PaymentMode | null>(prefill?.mode ?? null);
  const [tierId, setTierId] = useState<string | null>(() => {
    if (!prefill) return null;
    const tier = SPONSORSHIP_TIERS[prefill.mode].find(
      (t) => t.amount === prefill.amount,
    );
    return tier ? tier.id : OTHER_TIER_ID;
  });
  const [customAmount, setCustomAmount] = useState<number | "">(() => {
    if (!prefill) return "";
    const tier = SPONSORSHIP_TIERS[prefill.mode].find(
      (t) => t.amount === prefill.amount,
    );
    return tier ? "" : prefill.amount;
  });
  const [duration, setDuration] = useState<DurationSelection>(
    prefill?.duration ?? { optionId: "d_indef", months: null },
  );
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(
    prefill?.schedule ?? null,
  );
  // Cause defaults to general_care so a donor who doesn't engage the
  // picker still produces a valid value.
  const [cause, setCause] = useState<CauseEnum>(prefill?.cause ?? DEFAULT_CAUSE);
  // Visibility defaults to anonymous (faith-conscious / hidden-sadaqah
  // baseline). Donors opt INTO 'named'.
  const [visibility, setVisibility] = useState<VisibilityEnum>(
    prefill?.visibility ?? DEFAULT_VISIBILITY,
  );
  // Start at the review step if URL prefilled enough state to be valid.
  // Review is now step 7 after the visibility step inserted at 6.
  const [step, setStep] = useState<Step>(prefill ? 7 : 1);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(initialCartItemCount);

  const subhead = pickFirstSentence(child.story);
  const photoSrc = directusAssetUrl(child.photo);

  // Resolve effective amount from selected tier OR custom input.
  const amount = useMemo<number | null>(() => {
    if (!mode) return null;
    if (tierId === OTHER_TIER_ID) {
      if (typeof customAmount === "number" && isValidAmount(mode, customAmount)) {
        return customAmount;
      }
      return null;
    }
    if (tierId) {
      const found = SPONSORSHIP_TIERS[mode].find((t) => t.id === tierId);
      return found ? found.amount : null;
    }
    return null;
  }, [mode, tierId, customAmount]);

  function reset() {
    setMode(null);
    setTierId(null);
    setCustomAmount("");
    setDuration({ optionId: "d_indef", months: null });
    setSchedule(null);
    setCause(DEFAULT_CAUSE);
    setVisibility(DEFAULT_VISIBILITY);
    setStep(1);
    setError(null);
    setSuccess(false);
  }

  // ── Transitions ───────────────────────────────────────────────────────
  function pickMode(next: PaymentMode) {
    setError(null);
    setSuccess(false);
    setMode(next);
    setTierId(null);
    setCustomAmount("");
    // Reset downstream state.
    setDuration({ optionId: "d_indef", months: null });
    setSchedule(next === "monthly" ? null : null);
    setStep(2);
  }

  function selectTier(id: string) {
    setError(null);
    setSuccess(false);
    setTierId(id);
    if (id !== OTHER_TIER_ID) setCustomAmount("");
  }

  function confirmAmount() {
    if (mode === "one_time") {
      // One-time skips duration + schedule, jumps straight to cause picker.
      setStep(5);
    } else {
      setStep(3);
    }
  }

  function confirmDuration() {
    if (duration.months === null) {
      // Indefinite → schedule is implicitly "monthly", skip step 4.
      setSchedule("monthly");
      setStep(5);
    } else {
      setStep(4);
    }
  }

  function confirmSchedule() {
    setStep(5);
  }

  function confirmCause() {
    setStep(6);
  }

  function confirmVisibility() {
    setStep(7);
  }

  // Edit selections from review screen → restart at step 1 but preserve
  // the existing values so the donor can quickly pivot.
  function editSelections() {
    setStep(1);
    setError(null);
    setSuccess(false);
  }

  // ── Add to cart ───────────────────────────────────────────────────────
  async function addToCart() {
    if (!mode || amount === null) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        const body =
          mode === "one_time"
            ? {
                childId: child.id,
                paymentMode: mode,
                amountUsd: amount,
                durationMonths: null,
                paymentSchedule: null,
                cause,
                visibility,
              }
            : {
                childId: child.id,
                paymentMode: mode,
                amountUsd: amount,
                durationMonths: duration.months,
                paymentSchedule:
                  duration.months === null ? "monthly" : schedule,
                cause,
                visibility,
              };
        const res = await fetch("/api/cart/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as {
          cart?: { items?: unknown[] };
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? "Could not add to cart.");
          return;
        }
        setSuccess(true);
        setCartItemCount(
          Array.isArray(json.cart?.items)
            ? json.cart.items.length
            : cartItemCount + 1,
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("og:cart-changed"));
        }
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <section className="px-6 pt-8 pb-24 max-md:pt-6 max-md:pb-16">
      <div className="max-w-[1100px] mx-auto grid grid-cols-[1fr_1.4fr] gap-12 items-start max-lg:grid-cols-1 max-lg:gap-8">
        {/* Left: child summary */}
        <aside>
          <div className="relative aspect-[4/5] rounded-[28px] overflow-hidden shadow-card">
            {photoSrc ? (
              <ProtectedChildImage
                src={photoSrc}
                alt={child.display_name}
                width={600}
                height={750}
                quality={85}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="child-photo-placeholder" aria-hidden="true" />
            )}
          </div>
          <h1 className="mt-6 font-display text-[32px] text-ink leading-tight tracking-[-0.02em]">
            Sponsor {child.display_name.split(" ")[0]}
          </h1>
          <div className="mt-1 font-mono text-[11px] tracking-[0.12em] uppercase text-slate-soft">
            {child.district ? child.district : null}
            {child.district && child.age !== null ? " · " : null}
            {child.age !== null ? `Age ${child.age}` : null}
          </div>
          {subhead ? (
            <p className="mt-5 font-display italic text-[17px] text-slate leading-snug">
              &ldquo;{subhead}&rdquo;
            </p>
          ) : null}
          <Link
            href={`/children/${child.id}`}
            className="mt-5 inline-flex items-center gap-2 text-[13px] text-tangerine-deep font-medium border-b-[1.5px] border-tangerine pb-0.5"
          >
            ← Back to {child.display_name.split(" ")[0]}&apos;s profile
          </Link>
        </aside>

        {/* Right: stepped flow */}
        <div>
          {donorState === "pending_approval" ? (
            <div className="rounded-[18px] bg-[#FEF6EC] border border-tangerine-soft border-l-[4px] border-l-tangerine px-5 py-4 mb-6">
              <div className="font-display text-[17px] text-ink font-medium">
                You can build your cart now.
              </div>
              <p className="mt-1.5 text-[13.5px] text-slate leading-[1.6]">
                You&apos;ll be able to complete checkout once your account is
                approved (usually 1–2 business days).
              </p>
            </div>
          ) : null}
          {!signedIn ? (
            <p className="text-[13.5px] text-slate-soft mb-5">
              You&apos;ll sign in at checkout — no account needed yet.
            </p>
          ) : null}

          {/* Step 1: mode */}
          {step === 1 ? (
            <div className="mb-7">
              <StepHeader n={1} title="How would you like to give?" />
              {selfActiveMonthly ? (
                <SelfActiveMonthlyNote
                  childFirstName={child.display_name.split(" ")[0]!}
                  sponsorshipId={selfActiveMonthly.sponsorshipId}
                  scheduledEndDate={selfActiveMonthly.scheduledEndDate}
                />
              ) : monthlyLocked ? (
                <div className="mb-4 rounded-[14px] bg-moss-soft/40 border border-moss/30 px-4 py-3">
                  <p className="text-[13.5px] text-ink leading-snug">
                    <span className="font-display font-medium">
                      {child.display_name.split(" ")[0]}
                    </span>{" "}
                    already has a monthly sponsor. You can still send a
                    one-time gift to support them now.
                  </p>
                </div>
              ) : null}
              <ModeSelector
                value={mode}
                onChange={pickMode}
                monthlyLocked={monthlyLocked}
              />
            </div>
          ) : null}

          {/* Step 2: amount */}
          {step === 2 && mode ? (
            <div className="mb-7">
              <StepHeader n={2} title="Choose an amount" />
              <BackLink onClick={() => setStep(1)} label="Back to give type" />
              <TierGrid
                mode={mode}
                selectedTierId={tierId === OTHER_TIER_ID ? null : tierId}
                onSelect={selectTier}
              />
              <details
                open={tierId === OTHER_TIER_ID}
                className="mt-4 rounded-[14px] bg-white border border-ink/[0.08] px-4 py-3"
              >
                <summary
                  className="cursor-pointer text-[13px] text-tangerine-deep font-medium select-none"
                  onClick={() => selectTier(OTHER_TIER_ID)}
                >
                  Or choose another amount →
                </summary>
                <div className="mt-3">
                  <AmountInput
                    mode={mode}
                    value={customAmount}
                    onChange={(v) => {
                      setCustomAmount(v);
                      setTierId(OTHER_TIER_ID);
                      setSuccess(false);
                    }}
                  />
                </div>
              </details>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={confirmAmount}
                  disabled={amount === null}
                  className="inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          ) : null}

          {/* Step 3: duration (monthly only) */}
          {step === 3 && mode === "monthly" ? (
            <div className="mb-7">
              <StepHeader n={3} title="How long?" />
              <BackLink onClick={() => setStep(2)} label="Back to amount" />
              <DurationPicker value={duration} onChange={setDuration} />
              <div className="mt-5">
                <button
                  type="button"
                  onClick={confirmDuration}
                  disabled={!isDurationSelectionValid(duration)}
                  className="inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          ) : null}

          {/* Step 4: payment schedule (fixed-term monthly only) */}
          {step === 4 &&
          mode === "monthly" &&
          duration.months !== null &&
          amount !== null ? (
            <div className="mb-7">
              <StepHeader n={4} title="How would you like to pay?" />
              <BackLink onClick={() => setStep(3)} label="Back to duration" />
              <PaymentSchedulePicker
                amountUsd={amount}
                durationMonths={duration.months}
                value={schedule}
                onChange={setSchedule}
              />
              <div className="mt-5">
                <button
                  type="button"
                  onClick={confirmSchedule}
                  disabled={schedule === null}
                  className="inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          ) : null}

          {/* Step 5: cause picker (always shown). Back-link target depends
              on the previous active step — fixed-term → schedule (4),
              indefinite monthly → duration (3), one-time → amount (2). */}
          {step === 5 && mode && amount !== null ? (
            <div className="mb-7">
              <StepHeader
                n={5}
                title="What would you like this to support?"
              />
              <BackLink
                onClick={() => {
                  if (mode === "one_time") setStep(2);
                  else if (duration.months === null) setStep(3);
                  else setStep(4);
                }}
                label="Back"
              />
              <CausePicker value={cause} onChange={setCause} />
              <div className="mt-5">
                <button
                  type="button"
                  onClick={confirmCause}
                  className="inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep"
                >
                  Continue →
                </button>
              </div>
            </div>
          ) : null}

          {/* Step 6: visibility (named / anonymous). Always renders for
              every mode — Islamic hidden-charity preference applies
              equally to one-time and monthly. Default state is
              'anonymous'. */}
          {step === 6 && mode && amount !== null ? (
            <div className="mb-7">
              <StepHeader
                n={6}
                title="Should your name appear publicly?"
              />
              <BackLink onClick={() => setStep(5)} label="Back to cause" />
              <VisibilityPicker
                value={visibility}
                onChange={setVisibility}
                donorFirstName={donorFirstName}
              />
              <div className="mt-5">
                <button
                  type="button"
                  onClick={confirmVisibility}
                  className="inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep"
                >
                  Continue →
                </button>
              </div>
            </div>
          ) : null}

          {/* Step 7: review */}
          {step === 7 && mode && amount !== null ? (
            <div className="mb-5">
              <StepHeader n={7} title="Review" />
              <SponsorReviewCard
                paymentMode={mode}
                amountUsd={amount}
                durationMonths={mode === "monthly" ? duration.months : null}
                paymentSchedule={
                  mode === "monthly"
                    ? duration.months === null
                      ? "monthly"
                      : schedule
                    : null
                }
                cause={cause}
                visibility={visibility}
                donorFirstName={donorFirstName}
                onEdit={editSelections}
                onAddToCart={addToCart}
                pending={pending}
                error={error}
                ctaLabel={isEditing ? "Save changes" : "Add to cart"}
              />
            </div>
          ) : null}

          {success ? (
            <div className="rounded-xl bg-moss-soft/60 border border-moss/30 px-5 py-4 flex flex-wrap items-center justify-between gap-3 mb-5">
              <span className="text-[14px] text-ink">
                {isEditing ? "✓ Cart updated." : "✓ Added to your cart."}
              </span>
              <div className="flex items-center gap-3 text-[13px]">
                <button
                  type="button"
                  onClick={() => router.push("/cart")}
                  className="text-tangerine-deep font-medium border-b border-tangerine pb-0.5 hover:opacity-80"
                >
                  Go to cart →
                </button>
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="text-slate hover:text-ink"
                  >
                    Add another configuration
                  </button>
                ) : null}
                <Link href="/children" className="text-slate hover:text-ink">
                  Browse more children
                </Link>
              </div>
            </div>
          ) : null}

          {cartItemCount > 0 && !success ? (
            <Link
              href="/cart"
              className="inline-flex items-center gap-2 text-[13px] text-slate hover:text-tangerine-deep transition-colors"
            >
              View cart ({cartItemCount}{" "}
              {cartItemCount === 1 ? "item" : "items"}) →
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="font-display text-[20px] text-ink mb-3">
      <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-tangerine-deep mr-2">
        Step {n}
      </span>
      {title}
    </h2>
  );
}

// Friendly informational note shown at step 1 when the viewing donor
// is ALREADY the active monthly sponsor of this child. Distinct from
// the moss "locked by another donor" pill: this wants to feel like a
// guided handoff to /dashboard/sponsorship/[id], while still letting
// the donor add an additional one-time gift on top.
function SelfActiveMonthlyNote({
  childFirstName,
  sponsorshipId,
  scheduledEndDate,
}: {
  childFirstName: string;
  sponsorshipId: string;
  scheduledEndDate: string | null;
}) {
  // Format the end date readably; null (indefinite sub) → omit the
  // "through [date]" clause entirely so the copy stays grammatical.
  let throughClause = "";
  if (scheduledEndDate) {
    const d = new Date(scheduledEndDate);
    if (!Number.isNaN(d.getTime())) {
      throughClause = ` through ${d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}`;
    }
  }
  return (
    <div className="mb-4 rounded-[14px] bg-tangerine-mist/60 border border-tangerine-soft px-4 py-3.5">
      <p className="text-[13.5px] text-ink leading-[1.6]">
        You&rsquo;re already sponsoring{" "}
        <span className="font-display font-medium">{childFirstName}</span>{" "}
        monthly{throughClause}. You can extend or modify your sponsorship
        from your dashboard, or send an additional one-time gift below.
      </p>
      <Link
        href={`/dashboard/sponsorship/${sponsorshipId}`}
        className="mt-2 inline-flex items-center gap-1 text-[13px] text-tangerine-deep font-medium border-b-[1.5px] border-tangerine pb-0.5 hover:opacity-80"
      >
        Manage your monthly sponsorship →
      </Link>
    </div>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12.5px] text-slate-soft hover:text-tangerine-deep transition-colors mb-3"
    >
      ← {label}
    </button>
  );
}
