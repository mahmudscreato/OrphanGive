"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { formatUsd, MIN_AMOUNTS } from "@/lib/pricing";

type Status = "active" | "paused" | "cancelled";

type Props = {
  sponsorshipId: string;
  paymentMode: "monthly" | "one_time";
  status: Status | string;
  amountUsd: number;
  childName: string;
  nextBillingDate: string | null;
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
  childName,
  nextBillingDate,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveModal>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For one-time or cancelled: no actions surface. We let the page render
  // a friendly note; this component returns null.
  if (paymentMode !== "monthly" || status === "cancelled") return null;

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

  // Active button set is intentionally minimal: Add more months
  // (placeholder, opens a "coming soon" modal) + Cancel. Pause /
  // Resume / Change-amount remain implemented below as Modals + API
  // routes for when we re-enable them, but their buttons are hidden.
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        {status === "active" || status === "paused" ? (
          <>
            <ButtonOutline tone="tangerine" onClick={() => openModal("extend")}>
              Add more months
            </ButtonOutline>
            <ButtonOutline tone="danger" onClick={() => openModal("cancel")}>
              Cancel sponsorship
            </ButtonOutline>
          </>
        ) : null}
      </div>

      {/* Modals kept mounted but only one is open at a time. */}
      <ExtendComingSoonModal
        open={active === "extend"}
        onClose={closeModal}
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
        ? "border-tangerine text-tangerine-deep hover:bg-tangerine hover:text-cream"
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
      : "bg-tangerine text-cream hover:bg-tangerine-deep";
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
                  delta > 0 ? "text-moss font-medium" : "text-[#A02B2B] font-medium"
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

// ─── Extend / Add more months (coming soon) ─────────────────────────────────
function ExtendComingSoonModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add more months"
      description="Coming soon. We're adding the ability to extend your sponsorship in the next update."
    >
      <div className="mt-4 flex items-center justify-end">
        <ButtonFilled tone="tangerine" onClick={onClose}>
          Got it
        </ButtonFilled>
      </div>
    </Modal>
  );
}

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
