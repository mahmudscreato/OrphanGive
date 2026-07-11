"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Modal } from "./Modal";
import {
  CUSTOM_DURATION_MAX,
  CUSTOM_DURATION_MIN,
  formatUsd,
  MIN_AMOUNTS,
  type PaymentSchedule,
} from "@/lib/pricing";

// Lazy-load Stripe.js once per session (matches the StripePaymentSection
// pattern used at /checkout). Returns null if the publishable key isn't
// configured — the inline card form refuses to render in that case.
const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(): Promise<StripeJs | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!stripePromiseCache.has(key)) {
    stripePromiseCache.set(key, loadStripe(key));
  }
  return stripePromiseCache.get(key) ?? null;
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "15px",
      color: "#2A2A2C",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
      "::placeholder": { color: "#8B8B8E" },
    },
    invalid: {
      color: "#A02B2B",
      iconColor: "#A02B2B",
    },
  },
  hidePostalCode: false,
};

type Status = "active" | "prepaid" | "paused" | "cancelled" | "completed";

type Props = {
  sponsorshipId: string;
  paymentMode: "monthly" | "one_time";
  status: Status | string;
  amountUsd: number;
  childId: string;
  childName: string;
  nextBillingDate: string | null;
  // New: type metadata so the Extend modal can pick the right variant
  // (indefinite / fixed-term recurring / prepaid / one-time / completed).
  durationMonths: number | null;
  paymentSchedule: PaymentSchedule | null;
  prepaidMonthsTotal: number | null;
  prepaidMonthsRemaining: number | null;
  scheduledEndDate: string | null;
};

type ActiveModal =
  | null
  | "pause"
  | "resume"
  | "modify"
  | "cancel"
  | "extend";

export function SponsorshipActions({
  sponsorshipId,
  paymentMode,
  status,
  amountUsd,
  childId,
  childName,
  nextBillingDate,
  durationMonths,
  paymentSchedule,
  prepaidMonthsTotal,
  prepaidMonthsRemaining,
  scheduledEndDate,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveModal>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For cancelled/completed: page hides the section entirely (parent guards).
  // For one-time monthly: we still render Add more months (informational
  // "can't extend" modal) + nothing else; cancel doesn't apply to a
  // gift that's already completed.
  if (status === "cancelled" || status === "completed") return null;

  async function call(path: string, body?: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }
      // Success — close modal, refresh server-rendered page so new state
      // shows immediately.
      setActive(null);
      setPending(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setPending(false);
    }
  }

  function openModal(which: Exclude<ActiveModal, null>) {
    setError(null);
    setActive(which);
  }
  function closeModal() {
    if (pending) return;
    setActive(null);
    setError(null);
  }

  // For one-time gifts the only action surfaced is the "Add more months"
  // info modal explaining that one-time gifts can't be extended. Cancel
  // doesn't apply.
  const showCancelButton = paymentMode === "monthly";

  // Pause / Resume / Change-amount button gates. These MIRROR the backend
  // route guards exactly so a button never appears in a state the route
  // would reject (all three additionally require monthly + a Stripe
  // subscription; a monthly active/paused sponsorship always has one, and
  // the rare missing-subscription case degrades gracefully via the modal's
  // ErrorBox rather than a dead button):
  //   pause         → monthly + status='active'      (pause/route.ts:22,28)
  //   resume        → monthly + status='paused'      (resume/route.ts:26,32)
  //   modify-amount → monthly + status ∈ active|paused (modify-amount/route.ts:47,53)
  const isMonthly = paymentMode === "monthly";
  const showResume = isMonthly && status === "paused";
  const showPause = isMonthly && status === "active";
  const showModify =
    isMonthly && (status === "active" || status === "paused");

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <ButtonOutline tone="tangerine" onClick={() => openModal("extend")}>
          Add more months
        </ButtonOutline>
        {showResume ? (
          <ButtonOutline tone="tangerine" onClick={() => openModal("resume")}>
            Resume sponsorship
          </ButtonOutline>
        ) : null}
        {showPause ? (
          <ButtonOutline tone="grey" onClick={() => openModal("pause")}>
            Pause sponsorship
          </ButtonOutline>
        ) : null}
        {showModify ? (
          <ButtonOutline tone="grey" onClick={() => openModal("modify")}>
            Change amount
          </ButtonOutline>
        ) : null}
        {showCancelButton ? (
          <ButtonOutline tone="danger" onClick={() => openModal("cancel")}>
            Cancel sponsorship
          </ButtonOutline>
        ) : null}
      </div>

      {/* Modals kept mounted but only one is open at a time. The
          ExtendModal dispatches to a variant based on the sponsorship's
          type (indefinite / fixed-term recurring / prepaid / one-time).
          Extend variants own their own request lifecycle so they can
          handle the "no saved card" sentinel by swapping into an inline
          card-entry flow within the same modal. */}
      <ExtendModal
        open={active === "extend"}
        onClose={closeModal}
        sponsorshipId={sponsorshipId}
        paymentMode={paymentMode}
        durationMonths={durationMonths}
        paymentSchedule={paymentSchedule}
        prepaidMonthsTotal={prepaidMonthsTotal}
        prepaidMonthsRemaining={prepaidMonthsRemaining}
        scheduledEndDate={scheduledEndDate}
        amountUsd={amountUsd}
        childId={childId}
        childName={childName}
        onSuccess={() => {
          setActive(null);
          router.refresh();
        }}
      />
      <PauseModal
        open={active === "pause"}
        onClose={closeModal}
        pending={pending}
        error={error}
        childName={childName}
        onConfirm={() => call(`/api/sponsorship/${sponsorshipId}/pause`)}
      />
      <ResumeModal
        open={active === "resume"}
        onClose={closeModal}
        pending={pending}
        error={error}
        childName={childName}
        nextBillingDate={nextBillingDate}
        onConfirm={() => call(`/api/sponsorship/${sponsorshipId}/resume`)}
      />
      <ModifyModal
        open={active === "modify"}
        onClose={closeModal}
        pending={pending}
        error={error}
        currentAmount={amountUsd}
        onConfirm={(newAmount) =>
          call(`/api/sponsorship/${sponsorshipId}/modify-amount`, {
            newAmountUsd: newAmount,
          })
        }
      />
      <CancelModal
        open={active === "cancel"}
        onClose={closeModal}
        pending={pending}
        error={error}
        childName={childName}
        onConfirm={(reason) =>
          call(`/api/sponsorship/${sponsorshipId}/cancel`, { reason })
        }
      />
    </>
  );
}

// ─── Buttons ────────────────────────────────────────────────────────────────
function ButtonOutline({
  tone,
  children,
  onClick,
}: {
  tone: "grey" | "tangerine" | "danger";
  children: React.ReactNode;
  onClick: () => void;
}) {
  const colors =
    tone === "danger"
      ? "border-[#A02B2B] text-[#A02B2B] hover:bg-[#A02B2B] hover:text-cream"
      : tone === "tangerine"
        ? "border-tangerine text-tangerine-deep hover:bg-tangerine hover:text-ink"
        : "border-ink/[0.16] text-ink hover:bg-ink hover:text-cream";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center font-body font-semibold rounded-full border-[1.5px] px-5 py-[10px] text-[13.5px] transition-colors ${colors}`}
    >
      {children}
    </button>
  );
}
function ButtonFilled({
  tone,
  children,
  onClick,
  type = "button",
  disabled,
}: {
  tone: "tangerine" | "danger";
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const colors =
    tone === "danger"
      ? "bg-[#A02B2B] text-cream hover:opacity-90"
      : "bg-tangerine text-ink hover:bg-tangerine-deep";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full px-6 py-[12px] text-[14px] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${colors}`}
    >
      {children}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-3 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[13px] text-[#A02B2B]"
    >
      {message}
    </div>
  );
}
function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
  );
}

// ─── Pause ──────────────────────────────────────────────────────────────────
function PauseModal({
  open,
  onClose,
  pending,
  error,
  childName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  childName: string;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pause this sponsorship?"
      description={`No charges will happen while paused. ${childName}'s sponsorship slot remains reserved for you, and you can resume anytime.`}
    >
      {error ? <ErrorBox message={error} /> : null}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <ButtonFilled
          tone="tangerine"
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? <Spinner /> : null}
          Pause sponsorship
        </ButtonFilled>
      </div>
    </Modal>
  );
}

// ─── Resume ─────────────────────────────────────────────────────────────────
function ResumeModal({
  open,
  onClose,
  pending,
  error,
  childName,
  nextBillingDate,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  childName: string;
  nextBillingDate: string | null;
  onConfirm: () => void;
}) {
  const nextStr = nextBillingDate ? formatDate(nextBillingDate) : null;
  const desc = nextStr
    ? `Your sponsorship of ${childName} will resume. Your next charge will be on ${nextStr}.`
    : `Your sponsorship of ${childName} will resume. Your next charge will be on the standard billing date.`;
  return (
    <Modal open={open} onClose={onClose} title="Resume sponsorship?" description={desc}>
      {error ? <ErrorBox message={error} /> : null}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
        >
          Not now
        </button>
        <ButtonFilled
          tone="tangerine"
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? <Spinner /> : null}
          Resume
        </ButtonFilled>
      </div>
    </Modal>
  );
}

// ─── Modify amount ──────────────────────────────────────────────────────────
function ModifyModal({
  open,
  onClose,
  pending,
  error,
  currentAmount,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  currentAmount: number;
  onConfirm: (newAmount: number) => void;
}) {
  const [value, setValue] = useState<string>(String(currentAmount));
  // Reset the local field whenever the modal re-opens with a new current.
  useResetOnOpen(open, () => setValue(String(currentAmount)));

  const parsed = Number(value);
  const valid =
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= MIN_AMOUNTS.monthly &&
    parsed !== currentAmount;
  const tooLow =
    Number.isFinite(parsed) && parsed < MIN_AMOUNTS.monthly;
  const same =
    Number.isFinite(parsed) && parsed === currentAmount;

  const delta = Number.isFinite(parsed) ? parsed - currentAmount : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change monthly amount"
      description="The new amount takes effect on your next billing cycle. Stripe automatically prorates the partial month."
    >
      <div className="mt-2">
        <label className="block text-[12px] font-mono uppercase tracking-[0.12em] text-slate-soft mb-1.5">
          New monthly amount
        </label>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-display text-[18px] text-ink/60">
              $
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_AMOUNTS.monthly}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
              className="w-32 pl-7 pr-3 py-2 rounded-xl border border-ink/[0.16] bg-white font-display text-[20px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine-soft focus:border-tangerine"
            />
          </div>
          <span className="text-[14px] text-slate">/ month</span>
        </div>

        <div className="mt-3 text-[13px] text-slate-soft">
          Currently {formatUsd(currentAmount)} / month
          {valid ? (
            <>
              {" · "}
              <span
                className={
                  delta > 0 ? "text-moss-deep font-medium" : "text-[#A02B2B] font-medium"
                }
              >
                {delta > 0 ? "+" : ""}
                {formatUsd(delta)}
              </span>
            </>
          ) : null}
        </div>
        {tooLow ? (
          <p className="mt-2 text-[13px] text-[#A02B2B]">
            Minimum monthly amount is {formatUsd(MIN_AMOUNTS.monthly)}.
          </p>
        ) : null}
        {same ? (
          <p className="mt-2 text-[13px] text-slate-soft italic">
            That&rsquo;s the same as your current amount.
          </p>
        ) : null}
      </div>

      {error ? <ErrorBox message={error} /> : null}

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <ButtonFilled
          tone="tangerine"
          onClick={() => onConfirm(parsed)}
          disabled={pending || !valid}
        >
          {pending ? <Spinner /> : null}
          Save changes
        </ButtonFilled>
      </div>
    </Modal>
  );
}

// ─── Cancel ─────────────────────────────────────────────────────────────────
const CANCEL_REASON_PRESETS: Array<{ id: string; label: string; text: string }> = [
  {
    id: "financial",
    label: "Financial hardship",
    text: "Financial hardship — I need to pause my giving for now.",
  },
  {
    id: "lost_interest",
    label: "Lost interest",
    text: "I'm no longer feeling as connected to this sponsorship.",
  },
  {
    id: "elsewhere",
    label: "Sponsoring elsewhere",
    text: "I've decided to direct my giving to another organisation.",
  },
  {
    id: "personal",
    label: "Personal reason",
    text: "Personal reason I'd rather not share.",
  },
  {
    id: "other",
    label: "Other",
    text: "",
  },
];

function CancelModal({
  open,
  onClose,
  pending,
  error,
  childName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  error: string | null;
  childName: string;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [presetId, setPresetId] = useState<string | null>(null);
  useResetOnOpen(open, () => {
    setReason("");
    setPresetId(null);
  });

  function pickPreset(p: (typeof CANCEL_REASON_PRESETS)[number]) {
    setPresetId(p.id);
    // Pre-fill textarea with the preset's text. Donor can still edit.
    setReason(p.text);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="danger"
      title="⚠️ Cancel sponsorship?"
      description={`Cancelling means no future charges for ${childName}. ${childName}'s record stays in our system, but you'll no longer be linked as a sponsor.`}
    >
      <div className="mt-2">
        <div className="text-[12px] font-mono uppercase tracking-[0.12em] text-slate-soft mb-2">
          Quick reason (optional)
        </div>
        <div className="flex flex-wrap gap-2">
          {CANCEL_REASON_PRESETS.map((p) => {
            const selected = presetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p)}
                disabled={pending}
                aria-pressed={selected}
                className={
                  "inline-flex items-center px-3 py-1.5 rounded-full text-[12.5px] font-body transition-colors border-[1.5px] " +
                  (selected
                    ? "bg-tangerine-mist border-tangerine text-tangerine-deep"
                    : "bg-white border-ink/[0.12] text-slate hover:border-ink/[0.24] hover:text-ink") +
                  " disabled:opacity-50 disabled:cursor-not-allowed"
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {presetId === "other" ? (
          <p className="mt-2 text-[12px] text-slate-soft italic">
            Tell us more below.
          </p>
        ) : null}
      </div>

      <label className="block mt-4 text-[12px] font-mono uppercase tracking-[0.12em] text-slate-soft mb-1.5">
        Anything else? (optional)
      </label>
      <textarea
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          // Free-form edits clear the chip selection unless still
          // matching the preset's exact text.
          if (
            presetId &&
            CANCEL_REASON_PRESETS.find((p) => p.id === presetId)?.text !==
              e.target.value
          ) {
            setPresetId(null);
          }
        }}
        disabled={pending}
        rows={3}
        maxLength={500}
        placeholder="Anything you'd like to share?"
        className="w-full px-3 py-2 rounded-xl border border-ink/[0.16] bg-white text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine-soft focus:border-tangerine resize-none"
      />

      {error ? <ErrorBox message={error} /> : null}

      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
        >
          Keep sponsoring
        </button>
        <ButtonFilled
          tone="danger"
          onClick={() => onConfirm(reason.trim())}
          disabled={pending}
        >
          {pending ? <Spinner /> : null}
          Cancel sponsorship
        </ButtonFilled>
      </div>
    </Modal>
  );
}

// ─── Extend / Add more months ───────────────────────────────────────────────
// Dispatcher: picks one of 4 variants based on the sponsorship's type.
// The two interactive variants (recurring + prepaid) own their request
// lifecycle so they can swap to an inline card-entry flow when the donor
// has no saved payment method.
function ExtendModal({
  open,
  onClose,
  sponsorshipId,
  paymentMode,
  durationMonths,
  paymentSchedule,
  prepaidMonthsTotal,
  prepaidMonthsRemaining,
  scheduledEndDate,
  amountUsd,
  childId: _childId,
  childName,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  sponsorshipId: string;
  paymentMode: "monthly" | "one_time";
  durationMonths: number | null;
  paymentSchedule: PaymentSchedule | null;
  prepaidMonthsTotal: number | null;
  prepaidMonthsRemaining: number | null;
  scheduledEndDate: string | null;
  amountUsd: number;
  childId: string;
  childName: string;
  onSuccess: () => void;
}) {
  if (paymentMode === "one_time") {
    return (
      <ExtendInfoModal
        open={open}
        onClose={onClose}
        title="Add more months"
        description={`One-time gifts cannot be extended. To support ${childName} again, please make a new sponsorship.`}
      />
    );
  }
  if (
    paymentSchedule === "monthly" &&
    durationMonths == null
  ) {
    return (
      <ExtendInfoModal
        open={open}
        onClose={onClose}
        title="Add more months"
        description="This sponsorship continues until you cancel. To add a fixed-term commitment, please cancel and create a new sponsorship."
      />
    );
  }
  if (paymentSchedule === "monthly_prepaid") {
    return (
      <ExtendPrepaidModal
        open={open}
        onClose={onClose}
        sponsorshipId={sponsorshipId}
        amountUsd={amountUsd}
        childName={childName}
        prepaidMonthsTotal={prepaidMonthsTotal ?? 0}
        prepaidMonthsRemaining={prepaidMonthsRemaining ?? 0}
        scheduledEndDate={scheduledEndDate}
        onSuccess={onSuccess}
      />
    );
  }
  return (
    <ExtendRecurringModal
      open={open}
      onClose={onClose}
      sponsorshipId={sponsorshipId}
      amountUsd={amountUsd}
      childName={childName}
      durationMonths={durationMonths ?? 0}
      scheduledEndDate={scheduledEndDate}
      onSuccess={onSuccess}
    />
  );
}

// ─── Extend request hook ────────────────────────────────────────────────────
// Centralises the call → sentinel-detection → attach-and-retry flow used
// by both interactive Extend modals.
type ExtendPayload = {
  additionalMonths: number;
  paymentSchedule: PaymentSchedule;
};
type ExtendPhase = "idle" | "pending" | "needs_card" | "attaching";

function useExtendCall(sponsorshipId: string, onSuccess: () => void) {
  const [phase, setPhase] = useState<ExtendPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] = useState<ExtendPayload | null>(
    null,
  );

  function reset() {
    setPhase("idle");
    setError(null);
    setPendingPayload(null);
  }

  async function runExtend(payload: ExtendPayload) {
    setPhase("pending");
    setError(null);
    try {
      const res = await fetch(
        `/api/sponsorship/${sponsorshipId}/extend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
      };
      // Sentinel: server tells us the donor has no saved card. Swap UI
      // into the card-entry flow. We hold onto the payload so we can
      // retry once the card is attached.
      if (json.error === "no_saved_payment_method") {
        setPendingPayload(payload);
        setPhase("needs_card");
        setError(null);
        return;
      }
      if (!res.ok || !json.success) {
        setError(json.error ?? "Extension failed. Please try again.");
        setPhase("idle");
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setPhase("idle");
    }
  }

  // After the donor enters a card, attach it to their customer + set as
  // default, then retry the original extend payload.
  async function attachAndRetry(paymentMethodId: string) {
    if (!pendingPayload) {
      setError("Lost track of your selection. Please close and try again.");
      return;
    }
    setPhase("attaching");
    setError(null);
    try {
      const attach = await fetch(
        "/api/donor/me/payment-method/attach",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId }),
          cache: "no-store",
        },
      );
      const aj = (await attach.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!attach.ok || !aj.success) {
        setError(aj.error ?? "Could not save card.");
        setPhase("needs_card");
        return;
      }
      // Card is now the customer's default → retrying extend should
      // succeed off-session.
      await runExtend(pendingPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setPhase("needs_card");
    }
  }

  return { phase, error, setError, runExtend, attachAndRetry, reset };
}

// Plain informational modal (indefinite / one-time / completed cases).
function ExtendInfoModal({
  open,
  onClose,
  title,
  description,
  extraAction,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  extraAction?: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <div className="mt-4 flex items-center justify-end gap-3">
        {extraAction}
        <ButtonFilled tone="tangerine" onClick={onClose}>
          Got it
        </ButtonFilled>
      </div>
    </Modal>
  );
}

function ExtendRecurringModal({
  open,
  onClose,
  sponsorshipId,
  amountUsd,
  childName,
  durationMonths,
  scheduledEndDate,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  sponsorshipId: string;
  amountUsd: number;
  childName: string;
  durationMonths: number;
  scheduledEndDate: string | null;
  onSuccess: () => void;
}) {
  const [value, setValue] = useState<string>("3");
  const [schedule, setSchedule] = useState<PaymentSchedule>("monthly");
  const flow = useExtendCall(sponsorshipId, onSuccess);
  useResetOnOpen(open, () => {
    setValue("3");
    setSchedule("monthly");
    flow.reset();
  });

  const parsed = Number(value);
  const valid =
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= CUSTOM_DURATION_MIN &&
    parsed <= CUSTOM_DURATION_MAX;
  const total = valid ? amountUsd * parsed : 0;
  const remaining = monthsRemainingUntil(scheduledEndDate) ?? durationMonths;
  const busy = flow.phase !== "idle";

  // Inline card-entry view: reached when the server returned the
  // no_saved_payment_method sentinel. The form attaches the entered card
  // and retries the same extend payload automatically.
  if (flow.phase === "needs_card" || flow.phase === "attaching") {
    return (
      <Modal
        open={open}
        onClose={busy ? () => {} : onClose}
        title="Add a payment method"
        description={`To pay ${formatUsd(total)} for ${parsed} more ${
          parsed === 1 ? "month" : "months"
        }, please enter card details below. We'll save this card for future extensions.`}
      >
        <InlineCardCollector
          amountUsd={total}
          ctaLabel={`Pay ${formatUsd(total)}`}
          submitting={flow.phase === "attaching"}
          error={flow.error}
          onSubmit={(pmId) => flow.attachAndRetry(pmId)}
          onCancel={() => flow.reset()}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Extend your sponsorship of ${childName}`}
      description={`You're currently committed for ${durationMonths} ${
        durationMonths === 1 ? "month" : "months"
      } (${remaining} remaining). How many more months would you like to add?`}
    >
      <div className="mt-2">
        <label className="block text-[12px] font-mono uppercase tracking-[0.12em] text-slate-soft mb-1.5">
          Additional months
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={CUSTOM_DURATION_MIN}
          max={CUSTOM_DURATION_MAX}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          className="w-24 px-3 py-2 rounded-xl border border-ink/[0.16] bg-white font-display text-[18px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine-soft focus:border-tangerine"
        />
        <span className="ml-3 text-[14px] text-slate">
          months ({CUSTOM_DURATION_MIN}–{CUSTOM_DURATION_MAX})
        </span>
        {valid ? (
          <div className="mt-2 text-[13px] text-slate-soft">
            {formatUsd(amountUsd)} × {parsed} = {formatUsd(total)}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="block text-[12px] font-mono uppercase tracking-[0.12em] text-slate-soft mb-2">
          How would you like to pay?
        </div>
        <div className="space-y-2">
          <RadioOption
            checked={schedule === "monthly"}
            onChange={() => setSchedule("monthly")}
            disabled={busy}
            label="Add to monthly schedule"
            sub="No charge today. Your existing monthly billing simply continues for the additional months."
          />
          <RadioOption
            checked={schedule === "monthly_prepaid"}
            onChange={() => setSchedule("monthly_prepaid")}
            disabled={busy}
            label="Pay for additional months now"
            sub={
              valid
                ? `${formatUsd(total)} charged today to your saved card.`
                : "Charge for the full amount today."
            }
          />
        </div>
      </div>

      {flow.error ? <ErrorBox message={flow.error} /> : null}

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <ButtonFilled
          tone="tangerine"
          onClick={() =>
            flow.runExtend({
              additionalMonths: parsed,
              paymentSchedule: schedule,
            })
          }
          disabled={busy || !valid}
        >
          {flow.phase === "pending" ? <Spinner /> : null}
          Confirm
        </ButtonFilled>
      </div>
    </Modal>
  );
}

function ExtendPrepaidModal({
  open,
  onClose,
  sponsorshipId,
  amountUsd,
  childName,
  prepaidMonthsTotal,
  prepaidMonthsRemaining,
  scheduledEndDate,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  sponsorshipId: string;
  amountUsd: number;
  childName: string;
  prepaidMonthsTotal: number;
  prepaidMonthsRemaining: number;
  scheduledEndDate: string | null;
  onSuccess: () => void;
}) {
  const [value, setValue] = useState<string>("3");
  const [schedule, setSchedule] = useState<PaymentSchedule>("monthly_prepaid");
  const flow = useExtendCall(sponsorshipId, onSuccess);
  useResetOnOpen(open, () => {
    setValue("3");
    setSchedule("monthly_prepaid");
    flow.reset();
  });

  const parsed = Number(value);
  const valid =
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= CUSTOM_DURATION_MIN &&
    parsed <= CUSTOM_DURATION_MAX;
  const total = valid ? amountUsd * parsed : 0;
  const prepaidEndStr = formatHumanDate(scheduledEndDate);
  const busy = flow.phase !== "idle";
  const isPayNow = schedule === "monthly_prepaid";

  if (flow.phase === "needs_card" || flow.phase === "attaching") {
    // Both schedules require a saved card (pay-now charges immediately;
    // monthly tail charges off-session at billing_cycle_anchor). The
    // card-collector modal copy adjusts to mention "future monthly
    // charges" when the donor picked the monthly option.
    return (
      <Modal
        open={open}
        onClose={busy ? () => {} : onClose}
        title="Add a payment method"
        description={
          isPayNow
            ? `To pay ${formatUsd(total)} for ${parsed} more ${
                parsed === 1 ? "month" : "months"
              }, please enter card details below. We'll save this card for future extensions.`
            : `To start monthly billing of ${formatUsd(amountUsd)}/month after your prepaid period, please save a card. No charge today — billing begins ${prepaidEndStr ?? "after your prepaid period ends"}.`
        }
      >
        <InlineCardCollector
          amountUsd={isPayNow ? total : 0}
          ctaLabel={isPayNow ? `Pay ${formatUsd(total)}` : "Save card"}
          submitting={flow.phase === "attaching"}
          error={flow.error}
          onSubmit={(pmId) => flow.attachAndRetry(pmId)}
          onCancel={() => flow.reset()}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Extend your sponsorship of ${childName}`}
      description={`You're currently prepaid for ${prepaidMonthsTotal} ${
        prepaidMonthsTotal === 1 ? "month" : "months"
      } (${prepaidMonthsRemaining} remaining). How many more months would you like to add?`}
    >
      <div className="mt-2">
        <label className="block text-[12px] font-mono uppercase tracking-[0.12em] text-slate-soft mb-1.5">
          Additional months
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={CUSTOM_DURATION_MIN}
          max={CUSTOM_DURATION_MAX}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          className="w-24 px-3 py-2 rounded-xl border border-ink/[0.16] bg-white font-display text-[18px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine-soft focus:border-tangerine"
        />
        <span className="ml-3 text-[14px] text-slate">
          months ({CUSTOM_DURATION_MIN}–{CUSTOM_DURATION_MAX})
        </span>
        {valid ? (
          <div className="mt-2 text-[13px] text-slate-soft">
            {formatUsd(amountUsd)} × {parsed} = {formatUsd(total)}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="block text-[12px] font-mono uppercase tracking-[0.12em] text-slate-soft mb-2">
          How would you like to pay?
        </div>
        <div className="space-y-2">
          <RadioOption
            checked={schedule === "monthly_prepaid"}
            onChange={() => setSchedule("monthly_prepaid")}
            disabled={busy}
            label="Pay full amount now"
            sub={
              valid
                ? `${formatUsd(total)} charged today, covers ${parsed} additional ${
                    parsed === 1 ? "month" : "months"
                  }.`
                : "Charge for the full amount today."
            }
          />
          <RadioOption
            checked={schedule === "monthly"}
            onChange={() => setSchedule("monthly")}
            disabled={busy}
            label="Continue with monthly billing"
            sub={
              prepaidEndStr
                ? `No charge today. Monthly billing starts after your prepaid period ends (${prepaidEndStr}), then ${formatUsd(amountUsd)}/month for ${
                    valid ? parsed : "N"
                  } ${
                    valid && parsed === 1 ? "month" : "months"
                  }.`
                : `No charge today. ${formatUsd(amountUsd)}/month begins after your prepaid period ends.`
            }
          />
        </div>
      </div>

      {flow.error ? <ErrorBox message={flow.error} /> : null}

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <ButtonFilled
          tone="tangerine"
          onClick={() =>
            flow.runExtend({
              additionalMonths: parsed,
              paymentSchedule: schedule,
            })
          }
          disabled={busy || !valid}
        >
          {flow.phase === "pending" ? <Spinner /> : null}
          {!valid
            ? "Confirm extension"
            : isPayNow
              ? `Pay ${formatUsd(total)} now`
              : "Confirm extension"}
        </ButtonFilled>
      </div>
    </Modal>
  );
}

// Day/month/year used in modal subtitles. Keeps "Jan 6, 2027" form
// consistent with the dashboard cards.
function formatHumanDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Inline card collector (used by Extend modals on the no-saved-card
// fallback path) ────────────────────────────────────────────────────────────
function InlineCardCollector({
  amountUsd: _amountUsd,
  ctaLabel,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  amountUsd: number;
  ctaLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (paymentMethodId: string) => void;
  onCancel: () => void;
}) {
  const stripePromise = useMemo(() => getStripePromise(), []);
  if (!stripePromise) {
    return (
      <ErrorBox message="Stripe is not configured. Contact support." />
    );
  }
  return (
    <Elements stripe={stripePromise}>
      <InlineCardCollectorBody
        ctaLabel={ctaLabel}
        submitting={submitting}
        error={error}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </Elements>
  );
}

function InlineCardCollectorBody({
  ctaLabel,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  ctaLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (paymentMethodId: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardComplete, setCardComplete] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function submit() {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) {
      setLocalError("Card form not ready. Please refresh.");
      return;
    }
    setCreating(true);
    setLocalError(null);
    const pm = await stripe.createPaymentMethod({ type: "card", card });
    if (pm.error || !pm.paymentMethod) {
      setLocalError(pm.error?.message ?? "Could not read card details.");
      setCreating(false);
      return;
    }
    onSubmit(pm.paymentMethod.id);
    setCreating(false);
  }

  const busy = submitting || creating;
  const merged = localError ?? error;

  return (
    <div className="mt-2">
      <div className="rounded-xl border-[1.5px] border-ink/[0.12] bg-white px-4 py-3 transition-all focus-within:border-tangerine focus-within:ring-2 focus-within:ring-tangerine-soft">
        <CardElement
          options={CARD_ELEMENT_OPTIONS}
          onChange={(e) => {
            setCardComplete(e.complete);
            if (e.error) setLocalError(e.error.message);
            else if (localError && e.complete) setLocalError(null);
          }}
        />
      </div>
      {merged ? <ErrorBox message={merged} /> : null}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <ButtonFilled
          tone="tangerine"
          onClick={submit}
          disabled={busy || !cardComplete || !stripe}
        >
          {busy ? <Spinner /> : null}
          {ctaLabel}
        </ButtonFilled>
      </div>
    </div>
  );
}

// Generic radio row used inside ExtendRecurringModal.
function RadioOption({
  checked,
  onChange,
  disabled,
  label,
  sub,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      role="radio"
      aria-checked={checked}
      className={`w-full text-left rounded-[14px] px-4 py-3 transition-colors border-[1.5px] ${
        checked
          ? "bg-tangerine-mist border-tangerine"
          : "bg-white border-ink/[0.08] hover:border-ink/[0.2]"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-block w-3.5 h-3.5 rounded-full border-2 ${
            checked
              ? "border-tangerine bg-tangerine ring-2 ring-tangerine-mist"
              : "border-ink/[0.2] bg-white"
          }`}
          aria-hidden="true"
        />
        <span className="font-display text-[15px] text-ink leading-tight">
          {label}
        </span>
      </div>
      <p className="mt-1 ml-[26px] text-[12.5px] text-slate leading-snug">
        {sub}
      </p>
    </button>
  );
}

// Reuses the same 30.44-day month math as the API + dashboard so all
// three views agree on "X months remaining".
function monthsRemainingUntil(endIso: string | null): number | null {
  if (!endIso) return null;
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / (30.44 * 24 * 60 * 60 * 1000)));
}

// Re-export the link helper used by the (currently unused but kept for
// symmetry) completed-variant modal's "Visit profile" CTA. The page
// itself hides actions for completed status so this branch is unreachable
// today — wired for when we surface a completed-state inline message.
void Link;

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Run `fn` once per modal open transition (false → true). Lets us reset
// internal form state when a modal re-opens, e.g. ModifyModal re-syncs
// to the current amount.
function useResetOnOpen(open: boolean, fn: () => void): void {
  const prev = useRef(false);
  useEffect(() => {
    if (open && !prev.current) fn();
    prev.current = open;
    // fn is recreated each render but we only fire on the false→true
    // transition, which the prev ref guards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
