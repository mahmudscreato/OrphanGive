// Session 46 — History tab content for Child Detail.
//
// Server component. Replaces the Session 43 ComingSoonPanel for the
// History tab. Renders the chronological audit trail of DI actions
// touching this child (edit proposals, moments, reports, deliveries,
// withdrawals).
//
// File uploads (raw photo / video to directus_files) DON'T appear
// here — they audit at the collection level without childId metadata,
// because at upload time we don't yet know which child they're for.
// The follow-on row mutation (the moment / report / delivery they
// became part of) is what surfaces.

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CreditCard,
  Edit3,
  FileBarChart,
  FileText,
  HeartHandshake,
  History as HistoryIcon,
  ImagePlus,
  ListChecks,
  PauseCircle,
  PlayCircle,
  Receipt,
  RotateCcw,
  Trash2,
  Truck,
  Video,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { AuditAction, HistoryEvent } from "@/lib/di-audit";

const ACTION_ICON: Record<AuditAction, LucideIcon> = {
  di_submitted_proposal: Edit3,
  di_withdrew_proposal: Trash2,
  di_uploaded_moment: Camera,
  di_submitted_report: FileBarChart,
  di_resubmitted_report: RotateCcw,
  di_marked_delivery: Truck,
  di_started_task: ListChecks,
  di_completed_task: ListChecks,
  di_uploaded_photo: Camera,
  di_uploaded_video: Video,
  // Session 48b — intake-photo lifecycle.
  di_uploaded_intake_photo: ImagePlus,
  di_edited_intake_photo: Edit3,
  di_deleted_intake_photo: Trash2,
  // Session 49 — document lifecycle.
  di_uploaded_document: FileText,
  di_updated_document_notes: Edit3,
  di_deleted_document: Trash2,
  // Session 47 — admin actions surface on the per-child History tab
  // when their audit metadata.childId matches a child in the DI's
  // scope.
  admin_approved_proposal: CheckCircle2,
  admin_rejected_proposal: XCircle,
  // Session 51 — admin_viewed_proposal is logged for traceability
  // but never surfaces on DI feeds (the consumer of this map gates
  // by collection + action prefix). Map it to a neutral icon for
  // type safety; if a future surface ever decides to render it the
  // icon is reasonable.
  admin_viewed_proposal: HistoryIcon,
  // Session 52b — admin review queue actions. View events stay
  // admin-only so HistoryIcon is the type-safety placeholder;
  // approve/reject events surface on the per-child History tab.
  admin_viewed_document: HistoryIcon,
  admin_approved_document: CheckCircle2,
  admin_rejected_document: XCircle,
  admin_viewed_intake_photo_batch: HistoryIcon,
  admin_approved_intake_photo: CheckCircle2,
  admin_rejected_intake_photo: XCircle,
  admin_viewed_moment: HistoryIcon,
  admin_approved_moment: CheckCircle2,
  admin_rejected_moment: XCircle,
  // Spine 1.2 — admin report review. View/claim stay admin-only;
  // approve / edit-donor-text / send-back surface on per-child History.
  admin_viewed_report: HistoryIcon,
  admin_claimed_report_review: HistoryIcon,
  admin_approved_report: CheckCircle2,
  admin_edited_report_donor_text: Edit3,
  admin_requested_report_correction: RotateCcw,
  // Session 52c — admin removes use the trash icon to signal
  // "gone" (vs the X-circle for "rejected with feedback").
  admin_removed_document: Trash2,
  admin_removed_intake_photo: Trash2,
  // Session 52d — post-approval removes (same icon; the semantic
  // distinction lives in the audit description + DI notification).
  admin_removed_approved_document: Trash2,
  admin_removed_approved_intake_photo: Trash2,
  // Session 52d — admin direct uploads (admin filling in for DI).
  admin_uploaded_document: FileText,
  admin_uploaded_intake_photo: ImagePlus,
  // Session 65 — donor-management events. Type-safety placeholders.
  admin_viewed_donor: HistoryIcon,
  admin_approved_donor: CheckCircle2,
  admin_rejected_donor: XCircle,
  admin_suspended_donor: XCircle,
  admin_reactivated_donor: CheckCircle2,
  admin_triggered_password_reset: HistoryIcon,
  // Session 66 — admin child management. Type-safety placeholders.
  admin_viewed_child: HistoryIcon,
  admin_edited_child: Edit3,
  admin_archived_child: Trash2,
  admin_reactivated_child: CheckCircle2,
  admin_requested_document_reupload: Edit3,
  admin_requested_intake_reupload: Edit3,
  // Session 58.2 donation_package + currency_rate admin events. DI
  // never sees these on /di History (action.collection !== child) so
  // the icon choice is cosmetic; pick neutral document/edit glyphs.
  admin_created_donation_package: FileText,
  admin_edited_donation_package: Edit3,
  admin_archived_donation_package: Trash2,
  admin_reactivated_donation_package: CheckCircle2,
  admin_edited_currency_rate: Edit3,
  admin_reordered_donation_packages: ListChecks,
  // Phase 0 — admin sponsorship lifecycle.
  admin_cancelled_sponsorship: XCircle,
  admin_paused_sponsorship: PauseCircle,
  admin_resumed_sponsorship: PlayCircle,
  admin_refunded_sponsorship_charge: RotateCcw,
  // Phase 0 — donor sponsorship lifecycle.
  donor_cancelled_sponsorship: XCircle,
  donor_paused_sponsorship: PauseCircle,
  donor_resumed_sponsorship: PlayCircle,
  donor_extended_sponsorship: HeartHandshake,
  donor_modified_sponsorship_amount: Edit3,
  donor_changed_sponsorship_visibility: Edit3,
  donor_cancelled_queued_sponsorship: XCircle,
  donor_resolved_queue_shift: ListChecks,
  // Phase 0 follow-up — Stripe webhook events. Never surface on the
  // per-child DI History tab (action prefix filter is di_*), but the
  // map must be exhaustive over AuditAction for type-safety.
  webhook_payment_succeeded: CreditCard,
  webhook_payment_failed: AlertTriangle,
  webhook_invoice_paid: Receipt,
  webhook_subscription_created: PlayCircle,
  webhook_subscription_deleted: XCircle,
  webhook_charge_refunded: RotateCcw,
  // Donation Lifecycle sub-phase 3 — admin fulfillment exception writes.
  admin_set_fulfillment_on_hold: PauseCircle,
  admin_set_fulfillment_disputed: AlertTriangle,
  admin_set_fulfillment_refund_requested: RotateCcw,
  admin_cleared_fulfillment_exception: CheckCircle2,
  // Spine 1.1 — admin field-task creation. Never surfaces on the
  // per-child DI History tab (action prefix filter is di_*), but
  // the map must be exhaustive over AuditAction for type-safety.
  admin_created_task: ListChecks,
};

// Compact relative time for the activity feed. Bigger gaps fall back
// to absolute date so "yesterday at 3:14pm" doesn't lie 6 months in.
function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function HistoryEventRow({ event }: { event: HistoryEvent }) {
  const Icon = ACTION_ICON[event.action] ?? HistoryIcon;
  return (
    <li className="flex gap-3 py-3 border-b border-stone-200 last:border-b-0">
      <div
        className="shrink-0 w-9 h-9 rounded-full bg-tangerine-mist text-tangerine-deeper flex items-center justify-center"
        aria-hidden="true"
      >
        <Icon className="w-4 h-4 stroke-[1.75]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-ink leading-snug">
          {event.description}
        </p>
        <p className="text-[12px] text-ink-soft mt-0.5">
          {formatRelative(event.timestamp)}
        </p>
      </div>
    </li>
  );
}

export function HistoryPanel({ events }: { events: HistoryEvent[] }) {
  return (
    <section
      aria-label="History"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[20px] text-ink leading-tight mb-4">
        History
      </h2>

      {events.length === 0 ? (
        <div className="py-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-3"
            aria-hidden="true"
          >
            <HistoryIcon className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            Your record begins here.
          </p>
          <p className="text-[14.5px] text-ink leading-relaxed mb-1">
            No activity yet.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed max-w-sm mx-auto">
            As you submit changes and uploads, they appear here.
          </p>
        </div>
      ) : (
        <ul>
          {events.map((e) => (
            <HistoryEventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
