// Lot 3 / Job C — shared status → human-label helpers.
//
// Pure display layer. Used by the few admin / DI / donor surfaces
// that render raw status enums in JSX (e.g. inside a custom pill,
// option label, or copy interpolation) but didn't yet route through
// a dedicated <StatusPill>. Display-only — these helpers do not
// change what any status MEANS or any transition logic.
//
// Each helper is forgiving: unknown values pass through unchanged
// so a new enum value added in Directus doesn't blow up the UI.

/**
 * Sponsorship payment-axis status (Stripe-driven).
 * Enum on `sponsorship.status` column.
 */
export function sponsorshipStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending_payment":
      return "Pending payment";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Ended";
    case "failed":
      return "Failed";
    default:
      return status ?? "—";
  }
}

/**
 * Stripe payment (charge / payment intent) status — the value lives
 * on `payment.status` and reflects Stripe's own lifecycle.
 */
export function paymentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "succeeded":
      return "Succeeded";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
    case "partially_refunded":
      return "Partially refunded";
    case "requires_action":
      return "Requires action";
    case "requires_payment_method":
      return "Awaiting payment method";
    case "canceled":
    case "cancelled":
      return "Cancelled";
    default:
      return status ?? "—";
  }
}

/**
 * Intake photo curation status.
 * Enum: pending | approved | rejected | archived.
 */
export function intakePhotoStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "archived":
      return "Archived";
    default:
      return status ?? "—";
  }
}
