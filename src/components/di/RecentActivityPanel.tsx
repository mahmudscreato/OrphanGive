// Session 47 — Recent Activity home-page preview panel.
//
// Server component. Renders up to 8 audit_log events relevant to
// this DI: their own actions plus admin actions on children in their
// scope. Each row links to a detail page where applicable.

import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  FileBarChart,
  FileText,
  HeartHandshake,
  Home,
  ImagePlus,
  ListChecks,
  Lock,
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
  admin_approved_proposal: CheckCircle2,
  admin_rejected_proposal: XCircle,
  // Session 51 — never rendered on DI's recent activity feed (the
  // upstream filter excludes admin_viewed_*); icon present for
  // type-safety only.
  admin_viewed_proposal: Home,
  // Session 52b — same type-safety pattern for the new admin
  // review actions. The approval/rejection icons match the
  // proposal pair (CheckCircle2 / XCircle) so any future render
  // surface stays visually consistent.
  admin_viewed_document: Home,
  admin_approved_document: CheckCircle2,
  admin_rejected_document: XCircle,
  admin_viewed_intake_photo_batch: Home,
  admin_approved_intake_photo: CheckCircle2,
  admin_rejected_intake_photo: XCircle,
  admin_viewed_moment: Home,
  admin_approved_moment: CheckCircle2,
  admin_rejected_moment: XCircle,
  // Spine 1.2 — admin report review icons.
  admin_viewed_report: Home,
  admin_claimed_report_review: Home,
  admin_approved_report: CheckCircle2,
  admin_edited_report_donor_text: Edit3,
  admin_requested_report_correction: RotateCcw,
  admin_sent_report_to_donor: CheckCircle2,
  // Session 52c — admin cleanup removes (distinct from rejection).
  admin_removed_document: Trash2,
  admin_removed_intake_photo: Trash2,
  // Session 52d — post-approval removes + admin direct uploads.
  admin_removed_approved_document: Trash2,
  admin_removed_approved_intake_photo: Trash2,
  admin_uploaded_document: FileText,
  admin_uploaded_intake_photo: ImagePlus,
  // Session 65 — donor-management events. Type-safety placeholders.
  admin_viewed_donor: Home,
  admin_approved_donor: CheckCircle2,
  admin_rejected_donor: XCircle,
  admin_suspended_donor: XCircle,
  admin_reactivated_donor: CheckCircle2,
  admin_triggered_password_reset: Home,
  // Session 66 — admin child management. Type-safety placeholders.
  admin_viewed_child: Home,
  admin_edited_child: Edit3,
  admin_archived_child: Trash2,
  admin_reactivated_child: CheckCircle2,
  admin_requested_document_reupload: Edit3,
  admin_requested_intake_reupload: Edit3,
  // Session 58.2 donation_package + currency_rate admin events.
  // Not surfaced on DI Recent Activity (no child scope) but the
  // map must be exhaustive over AuditAction.
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
  // Phase 0 follow-up — Stripe webhook events. Type-safety
  // placeholders; the DI Recent Activity reader filters to the DI's
  // own actions + admin actions on scoped children, so webhook rows
  // never surface here.
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
  // Spine 1.1 — admin field-task creation. Type-safety placeholder;
  // the DI Recent Activity feed filters to the DI's own actions +
  // admin actions on scoped children, so admin_created_task rows
  // never surface here (no childId metadata key from this audit).
  admin_created_task: ListChecks,
  // Admin half of the task state machine — verify (accepted) /
  // send-back (redo). admin_verified_task / admin_rejected_task carry
  // childId in metadata, so they CAN surface on the DI's Recent
  // Activity feed when the task's child is in the DI's scope.
  admin_verified_task: CheckCircle2,
  admin_rejected_task: RotateCcw,
  // Piece #3 — donation auto-task (system actor). Never surfaces on
  // the DI feed (system actor, no di_ prefix); type-safety placeholder.
  system_created_task: ListChecks,
  // Task quick-assign (admin → DI). No childId metadata, so it never
  // surfaces on the DI feed; type-safety placeholder.
  admin_assigned_task: ListChecks,
  // P2 — reveal lifecycle. Donor + system actions; never surface on
  // the DI feed (no di_ prefix). Type-safety placeholders only.
  donor_requested_reveal: Eye,
  donor_withdrew_reveal: EyeOff,
  system_revoked_reveal: Lock,
  system_expired_reveal: Lock,
  // P5 — safeguarding triage (admin-only; never on DI feeds).
  admin_logged_safeguarding_email: FileText,
  admin_set_safeguarding_risk: AlertTriangle,
  admin_changed_safeguarding_status: ListChecks,
  admin_recorded_safeguarding_action: Edit3,
  admin_assigned_safeguarding_report: HeartHandshake,
};

function relativeTime(iso: string | null): string {
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
  }).format(d);
}

// Click-target heuristic: route to the most useful page for each
// collection. Falls back to /di for unknown collections.
function hrefFor(event: HistoryEvent): string {
  switch (event.collection) {
    case "child_proposal":
      return "/di/submissions";
    case "child_moment":
    case "child_update":
    case "aid_delivery":
      // No single per-row detail page yet for these — drop back to
      // the children list, where DI can re-enter via the right child.
      return "/di/children";
    case "task":
      return "/di/tasks";
    default:
      return "/di";
  }
}

export function RecentActivityPanel({ events }: { events: HistoryEvent[] }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="flex items-center gap-2 mb-4">
        <Home
          className="w-4 h-4 text-tangerine-deeper stroke-[1.75]"
          aria-hidden="true"
        />
        <h3 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft font-medium">
          Recent activity
        </h3>
      </header>

      {events.length === 0 ? (
        <div className="py-6 text-center">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-tangerine-mist text-tangerine-deeper mb-2"
            aria-hidden="true"
          >
            <Home className="w-5 h-5 stroke-[1.5]" />
          </div>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            No recent activity yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => {
            const Icon = ACTION_ICON[e.action] ?? Home;
            return (
              <li key={e.id}>
                <Link
                  href={hrefFor(e)}
                  className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-tangerine-mist/30 transition-colors"
                >
                  <span
                    className="shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-tangerine-mist text-tangerine-deeper"
                    aria-hidden="true"
                  >
                    <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] text-ink leading-snug">
                      {e.description}
                    </p>
                    <p className="text-[11.5px] text-ink-soft mt-0.5">
                      {relativeTime(e.timestamp)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
