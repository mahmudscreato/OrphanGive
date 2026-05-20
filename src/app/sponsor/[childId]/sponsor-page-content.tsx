// Session 58.3 — restored multi-step /sponsor/[childId] flow.
//
// State machine (mirrors the pre-58.2 original):
//
//   MONTHLY (6 steps; no cause step — package implies it):
//     1 mode → 2 amount → 3 duration → 4 schedule → 5 visibility → 6 review
//     (Step 4 skipped when duration = "until I cancel" — schedule
//      defaults to recurring monthly.)
//
//   ONE-TIME (4-5 steps depending on selection):
//     1 mode → 2 amount-or-gift → [3 cause] → 4 visibility → 5 review
//     Step 3 (cause) is SKIPPED when the donor picked a specific gift
//     in Step 2 — the gift's cause_tag IS the cause.
//
// Mode mapping for /api/donate/init:
//   monthly + schedule="monthly"        → mode='subscription'
//     (subscription auto-cancels at N months via Stripe cancel_at when
//      duration is finite; open-ended when null)
//   monthly + schedule="monthly_prepaid" → mode='prepaid-bundle'
//     (single PI for amount × months upfront)
//   one_time                             → mode='one-time'
//     (single PI for the gift / quick amount)
//
// The Review step ends in INLINE Stripe Elements — no cart, no
// separate /checkout page. POST /api/donate/init, mount Elements
// with the returned clientSecret, confirm, navigate to
// /donate/success.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
// Session 58.4 — framer-motion (already in deps, ^12.38.0) drives the
// step cross-fade. AnimatePresence mode="wait" sequences exit → enter
// so steps don't overlap; motion.div keyed by step number triggers
// the swap.
import { AnimatePresence, motion } from "framer-motion";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import {
  type PaymentMode,
  type PaymentSchedule,
} from "@/lib/pricing";
import type { DonorState } from "@/lib/donor-data";
import { ModeSelector } from "@/components/sponsor/ModeSelector";
import {
  TierGrid,
  packagesToTierItems,
} from "@/components/sponsor/TierGrid";
import { GiftGrid, type GiftItem } from "@/components/sponsor/GiftGrid";
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
import { CurrencyPicker } from "@/components/donate/CurrencyPicker";
import {
  DEFAULT_CAUSE,
  labelForCause,
  type CauseEnum,
} from "@/lib/cause";
import {
  DEFAULT_VISIBILITY,
  type VisibilityEnum,
} from "@/lib/visibility";

// ─── Prop types — page.tsx passes pre-fetched Directus data ────────

type ChildProps = {
  id: string;
  display_name: string;
  age: number | null;
  district: string | null;
  photo: string | null;
  story: string | null;
  story_truncated: boolean;
};

interface PackageData {
  id: string;
  name_en: string;
  description_en: string;
  amount_bdt: number;
  cause_tag: string | null;
  icon: string | null;
}

interface CurrencyOption {
  code: string;
  symbol: string;
  display_name: string;
}

export interface SponsorPageContentProps {
  child: ChildProps;
  signedIn: boolean;
  donorState: DonorState;
  initialCartItemCount: number;
  monthlyLocked: boolean;
  donorFirstName: string | null;
  selfActiveMonthly: {
    sponsorshipId: string;
    scheduledEndDate: string | null;
  } | null;
  queueJoin: {
    position: number;
    estimatedStartsAt: string | null;
    activeEndDate: string | null;
    donorsAhead: number;
  } | null;
  queueFullThrough: string | null;
  // Session 58.3 — Directus data passed from server page.
  monthlyTiers: ReadonlyArray<PackageData>;
  oneTimeQuick: ReadonlyArray<PackageData>;
  oneTimeGifts: ReadonlyArray<PackageData>;
  currency: { code: string; symbol: string; display_name: string };
  currencyOptions: ReadonlyArray<CurrencyOption>;
  /** BDT per donor unit (e.g. 110 for USD). Powers client-side
   *  conversion of custom amounts + per-card totals. */
  bdtPerDonorUnit: number;
  /** Smallest active monthly tier amount in whole BDT. Drives the
   *  custom-amount floor for monthly. */
  monthlyMinBdt: number;
  /** Hardcoded one-time floor (1500 BDT per brief). */
  oneTimeMinBdt: number;
  /** Session 58.3.2 — when true, the donor's Stripe customer already
   *  has objects in this currency; the picker renders disabled. */
  currencyLocked: boolean;
}

const OTHER_TIER_ID = "other" as const;
type Step = 1 | 2 | 3 | 4 | 5 | 6;
const ONE_TIME_MIN_BDT_DEFAULT = 1500;

// Cached Stripe.js per publishable key.
const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(key: string): Promise<StripeJs | null> {
  if (!stripePromiseCache.has(key)) {
    stripePromiseCache.set(key, loadStripe(key));
  }
  return stripePromiseCache.get(key)!;
}

function pickFirstSentence(s: string | null): string | null {
  if (!s) return null;
  const m = s.trim().match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : s.trim().slice(0, 160);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function bdtFloorToDonor(bdt: number, bdtPerDonorUnit: number): number {
  if (bdtPerDonorUnit <= 0) return bdt;
  return Math.max(1, Math.ceil(bdt / bdtPerDonorUnit));
}

export function SponsorPageContent({
  child,
  signedIn,
  donorState,
  monthlyLocked,
  donorFirstName,
  selfActiveMonthly,
  queueJoin,
  queueFullThrough,
  monthlyTiers,
  oneTimeQuick,
  oneTimeGifts,
  currency,
  currencyOptions,
  bdtPerDonorUnit,
  monthlyMinBdt,
  oneTimeMinBdt,
  currencyLocked,
}: SponsorPageContentProps) {
  // ── State machine ─────────────────────────────────────────────────
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [tierId, setTierId] = useState<string | null>(null);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<number | "">("");
  const [duration, setDuration] = useState<DurationSelection>({
    optionId: "d_indef",
    months: null,
  });
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [cause, setCause] = useState<CauseEnum>(DEFAULT_CAUSE);
  const [visibility, setVisibility] = useState<VisibilityEnum>(DEFAULT_VISIBILITY);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);

  // Inline Stripe state — only present on Step 6 review when the
  // donor has clicked "Continue to payment".
  const [initing, setIniting] = useState(false);
  const [initData, setInitData] = useState<{
    clientSecret: string;
    sponsorshipId: string;
    publishableKey: string;
  } | null>(null);

  const subhead = pickFirstSentence(child.story);
  const photoSrc = directusAssetUrl(child.photo);

  // Session 58.3.2 Bug 3a — when the donor picks a tile/gift/custom
  // amount in Step 2, the Continue button can be below the fold
  // (especially with the one-time GiftGrid which adds another 8
  // tiles). Scroll the Continue button into view on selection so the
  // donor sees the next action.
  const step2ContinueRef = useRef<HTMLButtonElement | null>(null);

  // Session 58.4 — anchor for scroll-to-step-top on advance. Sits on
  // the outer right-column wrapper; on step change we smooth-scroll
  // its top into view so the donor always starts reading the new
  // panel from its heading (mobile especially — the photo + header
  // can otherwise be off-screen above).
  const stepFlowRef = useRef<HTMLDivElement | null>(null);

  // ── Resolve effective amount in DONOR currency (whole units) ─────
  const donorAmount = useMemo<number | null>(() => {
    if (!mode) return null;
    if (mode === "one_time" && giftId) {
      const gift = oneTimeGifts.find((g) => g.id === giftId);
      if (!gift) return null;
      return convertBdtToDonor(gift.amount_bdt, bdtPerDonorUnit);
    }
    if (tierId === OTHER_TIER_ID) {
      if (typeof customAmount === "number" && customAmount > 0) {
        return customAmount;
      }
      return null;
    }
    if (tierId) {
      const source = mode === "monthly" ? monthlyTiers : oneTimeQuick;
      const found = source.find((t) => t.id === tierId);
      return found ? convertBdtToDonor(found.amount_bdt, bdtPerDonorUnit) : null;
    }
    return null;
  }, [
    mode,
    tierId,
    giftId,
    customAmount,
    monthlyTiers,
    oneTimeQuick,
    oneTimeGifts,
    bdtPerDonorUnit,
  ]);

  // Mirror BDT for display in review.
  const perChargeBdt = useMemo<number>(() => {
    if (donorAmount === null) return 0;
    return Math.round(donorAmount * bdtPerDonorUnit);
  }, [donorAmount, bdtPerDonorUnit]);

  // Session 58.4 — on step change, smooth-scroll the right-column
  // top into view so the donor lands at the new step's heading.
  // Mobile-first: the photo + child header stack above the flow, so
  // without this the donor reads halfway down the panel after the
  // fade. Desktop is a no-op when already visible (block:'start' +
  // browser's natural anchor).
  //
  // Timing: 60ms delay lets the AnimatePresence exit + the new
  // motion.div's initial state settle so we're scrolling to the
  // actual rendered position. Skip on the very first render (step
  // starts at 1; no transition).
  const previousStepRef = useRef<number>(1);
  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    const id = setTimeout(() => {
      stepFlowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
    return () => clearTimeout(id);
  }, [step]);

  // Session 58.3.2 Bug 3a — keep the in-step "scroll Continue into
  // view after Step 2 selection" behaviour. It only fires when step
  // === 2 AND donorAmount becomes non-null (post-selection), so it
  // never competes with the 58.4 step-top scroll on advance (which
  // fires on step CHANGE while donorAmount is still null right after
  // mode pick).
  useEffect(() => {
    if (step !== 2) return;
    if (donorAmount === null) return;
    const id = requestAnimationFrame(() => {
      step2ContinueRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [step, donorAmount, tierId, giftId]);

  // Track whether the donor selected a specific GIFT (controls
  // cause-step skip). Gift defines the cause_tag implicitly.
  const isGiftSelected = mode === "one_time" && giftId !== null;

  // Session 58.4 — compute the step sequence + progress for the
  // donor's current path. Recomputed any time the path-defining
  // inputs change so the dot indicator stays accurate.
  const stepSequence = useMemo(
    () => getStepSequence(mode, isGiftSelected, duration.months),
    [mode, isGiftSelected, duration.months],
  );
  const stepProgress = useMemo(
    () => getStepProgress(step as StepNum, stepSequence),
    [step, stepSequence],
  );

  // Floors for AmountInput in donor currency.
  const monthlyMinDonor = bdtFloorToDonor(monthlyMinBdt, bdtPerDonorUnit);
  const oneTimeMinDonor = bdtFloorToDonor(
    oneTimeMinBdt || ONE_TIME_MIN_BDT_DEFAULT,
    bdtPerDonorUnit,
  );

  // ── Step transitions ─────────────────────────────────────────────
  function pickMode(next: PaymentMode) {
    setError(null);
    setMode(next);
    setTierId(null);
    setGiftId(null);
    setCustomAmount("");
    setDuration({ optionId: "d_indef", months: null });
    setSchedule(null);
    setStep(2);
  }

  function selectTier(id: string) {
    setError(null);
    setTierId(id);
    setGiftId(null);
    if (id !== OTHER_TIER_ID) setCustomAmount("");
  }

  function selectGift(id: string) {
    setError(null);
    setGiftId(id);
    setTierId(null);
    setCustomAmount("");
  }

  function confirmAmount() {
    if (mode === "one_time") {
      // One-time: if a gift was selected, skip cause (gift defines it).
      // Otherwise next step is cause.
      setStep(isGiftSelected ? 5 : 3);
    } else {
      // Monthly: next step is duration. No cause step in monthly path
      // — the package implies the support.
      setStep(3);
    }
  }

  function confirmDuration() {
    if (duration.months === null) {
      // Indefinite → schedule is implicitly recurring, skip Step 4.
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
    setStep(5);
  }

  function confirmVisibility() {
    setStep(6);
  }

  function editSelections() {
    setStep(1);
    setError(null);
    setInitData(null);
  }

  // ── Continue to payment: call /api/donate/init ──────────────────
  async function handleContinue() {
    if (!mode || donorAmount === null) return;
    setError(null);
    setIniting(true);
    try {
      // Session 58.3.1 — for monthly intent, the endpoint requires
      // explicit durationMonths + paymentSchedule reflecting the
      // donor's Step 3 + Step 4 choices. One-time intent leaves
      // both undefined.
      //
      // Mapping:
      //   "Continue until I cancel" → durationMonths=null, schedule='monthly'
      //   "N months" + "Pay monthly" → durationMonths=N, schedule='monthly'
      //   "N months" + "Pay full upfront" → durationMonths=N, schedule='monthly_prepaid'
      const monthlyFields =
        mode === "monthly"
          ? {
              durationMonths: duration.months,
              paymentSchedule:
                duration.months === null
                  ? "monthly"
                  : schedule ?? "monthly",
            }
          : {};

      let body: Record<string, unknown>;
      if (mode === "one_time" && giftId) {
        // Specific gift — packageId path.
        body = {
          packageId: giftId,
          currencyCode: currency.code,
          childId: child.id,
        };
      } else if (tierId && tierId !== OTHER_TIER_ID) {
        // Preset tile selected (monthly tier or one-time quick).
        body = {
          packageId: tierId,
          currencyCode: currency.code,
          childId: child.id,
          ...monthlyFields,
        };
      } else {
        // Custom amount — translate donor amount back to BDT and
        // send as custom. The endpoint enforces floors server-side.
        const bdt = Math.round(donorAmount * bdtPerDonorUnit);
        body = {
          customAmountBdt: bdt,
          customPackageType: mode === "monthly" ? "monthly" : "one_time",
          currencyCode: currency.code,
          childId: child.id,
          ...monthlyFields,
        };
      }
      const res = await fetch("/api/donate/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        // Session 58.3.2 — currency-lock safety net. The page-load
        // lock should have prevented this, but race conditions can
        // still send us here. Switch the og_currency cookie to the
        // locked currency and reload so the picker pre-locks and the
        // amounts re-convert.
        if (
          res.status === 409 &&
          json.error === "currency_locked" &&
          typeof json.lockedCurrency === "string"
        ) {
          const locked = json.lockedCurrency as string;
          setError(
            `Showing prices in ${locked} — the currency linked to your account. Reloading…`,
          );
          // Cookie name + attrs mirror src/lib/geo-currency.ts (30-day,
          // sameSite=lax, not httpOnly so the client can read it back).
          document.cookie = `og_currency=${locked}; path=/; max-age=${30 * 24 * 3600}; samesite=lax`;
          setTimeout(() => window.location.reload(), 1200);
          setIniting(false);
          return;
        }
        setError(json.error || json.message || "Could not start checkout");
        setIniting(false);
        return;
      }
      setInitData({
        clientSecret: json.clientSecret,
        sponsorshipId: json.sponsorshipId,
        publishableKey: json.stripePublishableKey,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIniting(false);
    }
  }

  // Resolve cause label for review (only when cause step was visited
  // — i.e. one-time custom or one-time quick amount, never monthly).
  const causeLabel = useMemo<string | null>(() => {
    if (mode !== "one_time") return null;
    if (giftId) {
      const g = oneTimeGifts.find((x) => x.id === giftId);
      return g ? g.name_en : null;
    }
    return labelForCause(cause);
  }, [mode, giftId, oneTimeGifts, cause]);

  // ── Render ────────────────────────────────────────────────────────
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
            className="mt-5 inline-flex items-center gap-2 text-[13px] text-tangerine-deeper font-medium border-b-[1.5px] border-tangerine pb-0.5"
          >
            ← Back to {child.display_name.split(" ")[0]}&apos;s profile
          </Link>
        </aside>

        {/* Right: stepped flow */}
        <div ref={stepFlowRef} className="scroll-mt-6">
          {/* Currency picker pinned top-right of the flow column.
              Session 58.3.2 — locked when the donor's Stripe customer
              already has objects in this currency; we surface a small
              note below the picker so they understand why it's fixed. */}
          <div className="flex flex-col items-end gap-1 mb-5">
            <CurrencyPicker
              current={currency}
              options={currencyOptions}
              fromPath={`/sponsor/${child.id}`}
              locked={currencyLocked}
            />
            {currencyLocked ? (
              <p className="text-[11.5px] text-slate-soft italic max-w-[280px] text-right">
                Showing prices in {currency.code} — the currency linked to
                your account.
              </p>
            ) : null}
          </div>

          {donorState === "pending_approval" ? (
            <div className="rounded-[18px] bg-[#FEF6EC] border border-tangerine-soft border-l-[4px] border-l-tangerine px-5 py-4 mb-6">
              <div className="font-display text-[17px] text-ink font-medium">
                You can complete your sponsorship once approved.
              </div>
              <p className="mt-1.5 text-[13.5px] text-slate leading-[1.6]">
                You&apos;ll be able to pay once your account is approved
                (usually 1–2 business days).
              </p>
            </div>
          ) : null}
          {!signedIn ? (
            <p className="text-[13.5px] text-slate-soft mb-5">
              You&apos;ll sign in to complete payment.
            </p>
          ) : null}

          {/* Session 58.4 — cross-fade between steps. AnimatePresence
              mode="wait" sequences exit→enter so steps don't overlap;
              motion.div keyed by step number triggers the swap. Subtle
              ~220ms opacity + 6px y on enter, -4px y on exit for a
              calm transition (charity flow tone, not flashy). The
              parent persistent shell (currency picker, child photo,
              gating banners above) stays mounted and doesn't flicker. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{
                duration: 0.22,
                ease: [0.22, 0.61, 0.36, 1],
              }}
            >
          {/* Step 1: mode */}
          {step === 1 ? (
            <div className="mb-7">
              <StepHeader
                n={1}
                title="How would you like to give?"
                progress={stepProgress}
              />
              {selfActiveMonthly ? (
                <SelfActiveMonthlyNote
                  childFirstName={child.display_name.split(" ")[0]!}
                  sponsorshipId={selfActiveMonthly.sponsorshipId}
                  scheduledEndDate={selfActiveMonthly.scheduledEndDate}
                />
              ) : monthlyLocked ? (
                <QueueFullNote
                  childFirstName={child.display_name.split(" ")[0]!}
                  queueFullThrough={queueFullThrough}
                />
              ) : queueJoin ? (
                <QueueJoinNote
                  childFirstName={child.display_name.split(" ")[0]!}
                  activeEndDate={queueJoin.activeEndDate}
                  estimatedStartsAt={queueJoin.estimatedStartsAt}
                  donorsAhead={queueJoin.donorsAhead}
                />
              ) : null}
              <ModeSelector
                value={mode}
                onChange={pickMode}
                monthlyLocked={monthlyLocked}
                monthlyQueueJoin={
                  queueJoin
                    ? {
                        position: queueJoin.position,
                        donorsAhead: queueJoin.donorsAhead,
                      }
                    : null
                }
              />
            </div>
          ) : null}

          {/* Step 2: amount (monthly = single TierGrid; one-time = two
              zones — TierGrid for quick amounts + GiftGrid for specific
              gifts) */}
          {step === 2 && mode ? (
            <div className="mb-7">
              <StepHeader
                n={2}
                title={
                  mode === "monthly"
                    ? "Choose an amount"
                    : "Choose an amount or a gift"
                }
                progress={stepProgress}
              />
              <BackLink onClick={() => setStep(1)} label="Back to give type" />

              {/* Quick amounts (zone A on one-time; the only zone on monthly) */}
              <TierGrid
                items={packagesToTierItems(
                  mode === "monthly" ? monthlyTiers : oneTimeQuick,
                  bdtPerDonorUnit,
                )}
                selectedTierId={
                  tierId === OTHER_TIER_ID ? null : tierId
                }
                onSelect={selectTier}
                perMonth={mode === "monthly"}
                currencySymbol={currency.symbol}
                currencyCode={currency.code}
              />

              {/* Custom amount, collapsed under the tiles */}
              <details
                open={tierId === OTHER_TIER_ID}
                className="mt-4 rounded-[14px] bg-white border border-ink/[0.08] px-4 py-3"
              >
                <summary
                  className="cursor-pointer text-[13px] text-tangerine-deeper font-medium select-none"
                  onClick={() => selectTier(OTHER_TIER_ID)}
                >
                  Or choose another amount →
                </summary>
                <div className="mt-3">
                  <AmountInput
                    perMonth={mode === "monthly"}
                    minDonorAmount={
                      mode === "monthly" ? monthlyMinDonor : oneTimeMinDonor
                    }
                    currencySymbol={currency.symbol}
                    currencyCode={currency.code}
                    value={customAmount}
                    onChange={(v) => {
                      setCustomAmount(v);
                      setTierId(OTHER_TIER_ID);
                      setGiftId(null);
                    }}
                  />
                </div>
              </details>

              {/* Zone B — specific gifts (one-time only) */}
              {mode === "one_time" && oneTimeGifts.length > 0 ? (
                <div className="mt-7">
                  <h3 className="font-mono text-[11px] tracking-[0.12em] uppercase text-slate font-medium mb-3">
                    Or give a specific gift
                  </h3>
                  <GiftGrid
                    items={oneTimeGifts.map<GiftItem>((g) => ({
                      id: g.id,
                      name: g.name_en,
                      description: g.description_en,
                      icon: g.icon,
                      donorAmount: convertBdtToDonor(
                        g.amount_bdt,
                        bdtPerDonorUnit,
                      ),
                      amountBdt: g.amount_bdt,
                    }))}
                    selectedGiftId={giftId}
                    onSelect={selectGift}
                    currencySymbol={currency.symbol}
                    currencyCode={currency.code}
                  />
                </div>
              ) : null}

              <div className="mt-6">
                <ContinueButton
                  innerRef={step2ContinueRef}
                  onClick={confirmAmount}
                  disabled={donorAmount === null}
                />
              </div>
            </div>
          ) : null}

          {/* Step 3 (monthly): duration */}
          {step === 3 && mode === "monthly" ? (
            <div className="mb-7">
              <StepHeader
                n={3}
                title="How long?"
                progress={stepProgress}
              />
              <BackLink onClick={() => setStep(2)} label="Back to amount" />
              <DurationPicker value={duration} onChange={setDuration} />
              <div className="mt-6">
                <ContinueButton
                  onClick={confirmDuration}
                  disabled={!isDurationSelectionValid(duration)}
                />
              </div>
            </div>
          ) : null}

          {/* Step 3 (one-time, cause): shown only when no gift selected */}
          {step === 3 && mode === "one_time" && !isGiftSelected && donorAmount !== null ? (
            <div className="mb-7">
              <StepHeader
                n={3}
                title="What is this gift for?"
                progress={stepProgress}
              />
              <BackLink onClick={() => setStep(2)} label="Back to amount" />
              <CausePicker value={cause} onChange={setCause} />
              <div className="mt-6">
                <ContinueButton onClick={confirmCause} />
              </div>
            </div>
          ) : null}

          {/* Step 4 (monthly): payment schedule (finite-duration only) */}
          {step === 4 &&
          mode === "monthly" &&
          duration.months !== null &&
          donorAmount !== null ? (
            <div className="mb-7">
              <StepHeader
                n={4}
                title="How would you like to pay?"
                progress={stepProgress}
              />
              <BackLink onClick={() => setStep(3)} label="Back to duration" />
              <PaymentSchedulePicker
                perMonthDonorAmount={donorAmount}
                durationMonths={duration.months}
                currencySymbol={currency.symbol}
                currencyCode={currency.code}
                value={schedule}
                onChange={setSchedule}
              />
              <div className="mt-6">
                <ContinueButton
                  onClick={confirmSchedule}
                  disabled={schedule === null}
                />
              </div>
            </div>
          ) : null}

          {/* Step 5: visibility (always renders for both modes) */}
          {step === 5 && mode && donorAmount !== null ? (
            <div className="mb-7">
              <StepHeader
                n={5}
                title="Should your name appear publicly?"
                progress={stepProgress}
              />
              <BackLink
                onClick={() => {
                  // Smart back: jump to whichever was the previous
                  // visited step.
                  if (mode === "one_time") {
                    setStep(isGiftSelected ? 2 : 3);
                  } else if (duration.months === null) {
                    setStep(3);
                  } else {
                    setStep(4);
                  }
                }}
                label="Back"
              />
              <VisibilityPicker
                value={visibility}
                onChange={setVisibility}
                donorFirstName={donorFirstName}
              />
              <div className="mt-6">
                <ContinueButton onClick={confirmVisibility} />
              </div>
            </div>
          ) : null}

          {/* Step 6: review + inline payment */}
          {step === 6 && mode && donorAmount !== null ? (
            <div className="mb-5 space-y-5">
              <StepHeader
                n={6}
                title="Review"
                progress={stepProgress}
              />
              <SponsorReviewCard
                paymentMode={mode}
                perChargeDonorAmount={donorAmount}
                durationMonths={mode === "monthly" ? duration.months : null}
                paymentSchedule={
                  mode === "monthly"
                    ? duration.months === null
                      ? "monthly"
                      : schedule
                    : null
                }
                causeLabel={causeLabel}
                visibility={visibility}
                donorFirstName={donorFirstName}
                currencySymbol={currency.symbol}
                currencyCode={currency.code}
                perChargeBdt={perChargeBdt}
                queueJoin={
                  mode === "monthly" && queueJoin
                    ? {
                        position: queueJoin.position,
                        estimatedStartsAt: queueJoin.estimatedStartsAt,
                      }
                    : null
                }
                onEdit={editSelections}
                onContinue={handleContinue}
                pending={initing || initData !== null}
                error={error}
              />

              {initData ? (
                <div className="rounded-[20px] bg-white border border-ink/[0.08] px-6 py-5 shadow-warm">
                  <h3 className="font-display text-[18px] text-ink mb-3">
                    Payment
                  </h3>
                  <Elements stripe={getStripePromise(initData.publishableKey)}>
                    <PayInline
                      clientSecret={initData.clientSecret}
                      sponsorshipId={initData.sponsorshipId}
                    />
                  </Elements>
                </div>
              ) : null}
            </div>
          ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

// ─── Small helpers (kept at module scope; original file shape) ────

function convertBdtToDonor(amountBdt: number, bdtPerDonorUnit: number): number {
  if (bdtPerDonorUnit <= 0) return amountBdt;
  return Math.max(1, Math.round(amountBdt / bdtPerDonorUnit));
}

// Session 58.4 — step header with optional progress indicator.
// progress.current/total counts only the steps that will fire for the
// donor's chosen path (mode + giftSelected + duration combination).
// progress=null on Step 1 before mode is picked (we don't know the
// path yet).
function StepHeader({
  n,
  title,
  progress,
}: {
  n: number;
  title: string;
  progress: { current: number; total: number } | null;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-tangerine-deep">
          {progress
            ? `Step ${progress.current} of ${progress.total}`
            : `Step ${n}`}
        </span>
        {progress ? (
          <div
            className="flex items-center gap-1.5"
            aria-hidden="true"
          >
            {Array.from({ length: progress.total }, (_, i) => (
              <span
                key={i}
                className={`h-1 w-5 rounded-full transition-colors duration-300 ${
                  i < progress.current ? "bg-tangerine" : "bg-ink/[0.10]"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
      <h2 className="font-display text-[22px] text-ink leading-tight tracking-[-0.01em]">
        {title}
      </h2>
    </div>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12.5px] text-slate-soft hover:text-tangerine-deeper transition-colors mb-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas"
    >
      ← {label}
    </button>
  );
}

// Session 58.4 — shared Continue/primary CTA button. Consistent
// sizing, weight, hover lift, focus-visible, disabled state. Uses
// only brand tokens (tangerine fill, ink text). The `ref` is
// optional for callers that want to scroll-into-view (e.g. Step 2
// scroll-to-continue still works after a selection).
const PRIMARY_BTN_CLASSES =
  "inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-3 text-[14px] shadow-warm transition-all duration-150 hover:-translate-y-[1px] hover:bg-tangerine-deep hover:shadow-md active:translate-y-0 active:shadow-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none disabled:hover:bg-tangerine";

const ContinueButton = ({
  onClick,
  disabled,
  innerRef,
  children = (
    <>
      Continue <span aria-hidden="true">→</span>
    </>
  ),
}: {
  onClick: () => void;
  disabled?: boolean;
  innerRef?: React.Ref<HTMLButtonElement>;
  children?: React.ReactNode;
}) => (
  <button
    ref={innerRef}
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={PRIMARY_BTN_CLASSES}
  >
    {children}
  </button>
);

// Compute the donor's step PATH so the indicator can show "Step 3 of
// 5" with N dots that match the actual sequence they'll move through.
// Skipped steps (e.g. Step 4 for indefinite monthly; Step 3 for
// one-time gift selections) are excluded from the count.
type StepNum = 1 | 2 | 3 | 4 | 5 | 6;
function getStepSequence(
  mode: PaymentMode | null,
  giftSelected: boolean,
  durationMonthsForFiniteCheck: number | null,
): StepNum[] {
  if (!mode) return [1];
  if (mode === "monthly") {
    // Indefinite skips Step 4 (schedule).
    return durationMonthsForFiniteCheck === null
      ? [1, 2, 3, 5, 6]
      : [1, 2, 3, 4, 5, 6];
  }
  // one_time: gift skips Step 3 (cause).
  return giftSelected ? [1, 2, 5, 6] : [1, 2, 3, 5, 6];
}
function getStepProgress(
  step: StepNum,
  sequence: StepNum[],
): { current: number; total: number } | null {
  const idx = sequence.indexOf(step);
  if (idx < 0) return null;
  // Don't show the indicator when mode hasn't been picked yet (Step 1,
  // sequence=[1]) — looks silly to show "Step 1 of 1".
  if (sequence.length <= 1) return null;
  return { current: idx + 1, total: sequence.length };
}

function QueueJoinNote({
  childFirstName,
  activeEndDate,
  estimatedStartsAt,
  donorsAhead,
}: {
  childFirstName: string;
  activeEndDate: string | null;
  estimatedStartsAt: string | null;
  donorsAhead: number;
}) {
  const activeEndStr = formatDate(activeEndDate);
  const startStr = formatDate(estimatedStartsAt);
  return (
    <div className="mb-4 rounded-[14px] bg-moss-soft/40 border border-moss/30 px-4 py-3.5">
      <p className="text-[13.5px] text-ink leading-[1.6]">
        <span className="font-display font-medium">{childFirstName}</span>{" "}
        currently has a monthly sponsor
        {activeEndStr ? ` through ${activeEndStr}` : ""}. You can pay
        upfront now to claim a future slot — your sponsorship will begin
        {startStr ? ` around ${startStr}` : " when the current sub ends"}.
      </p>
      <p className="mt-1.5 text-[12.5px] text-slate-soft italic leading-snug">
        Donors ahead of you: {donorsAhead}. You can also send a one-time
        gift to support {childFirstName} today.
      </p>
    </div>
  );
}

function QueueFullNote({
  childFirstName,
  queueFullThrough,
}: {
  childFirstName: string;
  queueFullThrough: string | null;
}) {
  const throughStr = formatDate(queueFullThrough);
  return (
    <div className="mb-4 rounded-[14px] bg-moss-soft/40 border border-moss/30 px-4 py-3">
      <p className="text-[13.5px] text-ink leading-[1.6]">
        <span className="font-display font-medium">{childFirstName}</span>
        &rsquo;s sponsor queue is full
        {throughStr ? ` through ${throughStr}` : ""}.
        {throughStr ? ` Check back after ${throughStr}.` : ""} You can
        still send a one-time gift today.
      </p>
    </div>
  );
}

function SelfActiveMonthlyNote({
  childFirstName,
  sponsorshipId,
  scheduledEndDate,
}: {
  childFirstName: string;
  sponsorshipId: string;
  scheduledEndDate: string | null;
}) {
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
        className="mt-2 inline-flex items-center gap-1 text-[13px] text-tangerine-deeper font-medium border-b-[1.5px] border-tangerine pb-0.5 hover:opacity-80"
      >
        Manage your monthly sponsorship →
      </Link>
    </div>
  );
}

// ─── Inline Stripe Elements ──────────────────────────────────────

const CARD_OPTIONS = {
  style: {
    base: {
      fontSize: "15px",
      color: "#2A2A2C",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
      "::placeholder": { color: "#8B8B8E" },
    },
    invalid: { color: "#A02B2B", iconColor: "#A02B2B" },
  },
  hidePostalCode: false,
};

function PayInline({
  clientSecret,
  sponsorshipId,
}: {
  clientSecret: string;
  sponsorshipId: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const cancelled = useRef(false);

  async function handlePay() {
    if (!stripe || !elements) return;
    setError(null);
    setPending(true);
    const card = elements.getElement(CardElement);
    if (!card) {
      setError("Card form not ready. Please refresh.");
      setPending(false);
      return;
    }
    try {
      const pmRes = await stripe.createPaymentMethod({ type: "card", card });
      if (pmRes.error || !pmRes.paymentMethod) {
        setError(pmRes.error?.message ?? "Could not read card details.");
        setPending(false);
        return;
      }
      const isSetup = clientSecret.startsWith("seti_");
      const result = isSetup
        ? await stripe.confirmCardSetup(clientSecret, {
            payment_method: pmRes.paymentMethod.id,
          })
        : await stripe.confirmCardPayment(clientSecret, {
            payment_method: pmRes.paymentMethod.id,
          });
      if (result.error) {
        setError(result.error.message ?? "Payment could not be completed.");
        setPending(false);
        return;
      }
      if (cancelled.current) return;
      const url = `/donate/success?id=${sponsorshipId}`;
      router.push(url);
      setTimeout(() => {
        if (!window.location.pathname.startsWith("/donate/success")) {
          window.location.assign(url);
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setPending(false);
    }
  }

  return (
    <div>
      <div className="rounded-xl border-[1.5px] border-ink/[0.12] bg-white px-4 py-3.5 transition-all focus-within:border-tangerine focus-within:ring-2 focus-within:ring-tangerine-soft">
        <CardElement
          options={CARD_OPTIONS}
          onChange={(e) => {
            setCardComplete(e.complete);
            if (e.error) setError(e.error.message);
            else if (error && e.complete) setError(null);
          }}
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-3 py-2 text-[13px] text-[#A02B2B]"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-5">
        <button
          type="button"
          onClick={handlePay}
          disabled={!stripe || !cardComplete || pending}
          className={PRIMARY_BTN_CLASSES}
        >
          {pending ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin"
              />
              Processing…
            </>
          ) : (
            "Pay now"
          )}
        </button>
      </div>
    </div>
  );
}
