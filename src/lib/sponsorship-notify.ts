// Admin notification — a sponsorship payment succeeded.
//
// Mirrors di-notify.ts (the existing admin-notification pattern): sends
// one internal email per payment to every address in ADMIN_NOTIFY_EMAILS
// (the same config the pending-submission notifications use), via the
// existing Resend helper (src/lib/email.ts) + a React Email template.
//
// Fired from the Stripe webhook at the SAME trigger point and under the
// SAME idempotency guard as the donation auto-task (created === true →
// one freshly-recorded payment row → one email). So Stripe retries /
// webhook replays (created === false) never reach this, and monthly
// renewals — which each insert a NEW payment row — each send exactly one.
//
// Best-effort: NEVER throws into the caller (the webhook/payment must
// not be affected by an email failure). Privacy: child FIRST NAME only
// (Tier-1). No donor PII, no card details, no child Tier-3 data.

import "server-only";

import { readItems } from "@directus/sdk";
import React from "react";
import { directusServer } from "./directus";
import { sendEmail } from "./email";
import { AdminSponsorshipNotificationEmail } from "@/emails/AdminSponsorshipNotificationEmail";

export interface NotifySponsorshipPaymentInput {
  sponsorshipId: string;
  /** The PAYMENT ROW id — same id the auto-task keys on. */
  paymentId: string;
  /** Sponsored child id, or null for a campaign donation. */
  childId: string | null;
  amountUsd: number;
  paymentMode: string; // "monthly" | "one_time"
}

// Recipient(s) come from ADMIN_NOTIFY_EMAILS (shared with di-notify).
// When unset we fall back to admin@orphangive.org so the notification
// works out of the box; override via the env to add/redirect admins.
const DEFAULT_ADMIN_EMAIL = "admin@orphangive.org";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFY_EMAILS;
  if (!raw) return [DEFAULT_ADMIN_EMAIL];
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes("@"));
  return list.length > 0 ? list : [DEFAULT_ADMIN_EMAIL];
}

function getDirectusAdminBase(): string {
  return (
    process.env.NEXT_PUBLIC_DIRECTUS_URL?.replace(/\/$/, "") ??
    "https://admin.orphangive.org"
  );
}

async function resolveChildFirstName(
  childId: string | null,
): Promise<string | null> {
  if (!childId) return null;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["first_name"], // Tier-1 only — never display_name / Tier-3
        limit: 1,
      } as never),
    )) as unknown as Array<{ first_name: string | null }> | undefined;
    const name = rows?.[0]?.first_name?.trim();
    return name && name.length > 0 ? name : null;
  } catch (err) {
    console.warn(
      "[sponsorship-notify] child first_name resolution failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Email the admin team that a sponsorship payment succeeded. Always
 * returns void; never throws. Call ONLY when the payment row was freshly
 * created (created === true), alongside the auto-task, so there is
 * exactly one email per payment row.
 */
export async function notifyAdminOfSponsorshipPayment(
  input: NotifySponsorshipPaymentInput,
): Promise<void> {
  try {
    const recipients = getAdminEmails();
    if (recipients.length === 0) return;

    const childFirstName = await resolveChildFirstName(input.childId);
    const reviewUrl = `${getDirectusAdminBase()}/admin/content/sponsorship/${input.sponsorshipId}`;
    const paidAt = new Date().toISOString();
    const amountLabel = `$${input.amountUsd.toFixed(2)}`;
    const subject = childFirstName
      ? `[OrphanGive admin] New sponsorship payment — ${amountLabel} for ${childFirstName}`
      : `[OrphanGive admin] New sponsorship payment — ${amountLabel}`;

    const template = React.createElement(AdminSponsorshipNotificationEmail, {
      childFirstName,
      amountUsd: input.amountUsd,
      paymentMode: input.paymentMode,
      sponsorshipId: input.sponsorshipId,
      paymentId: input.paymentId,
      paidAt,
      reviewUrl,
    });

    // Sequential so one Resend rate-limit doesn't cascade-fail the rest.
    for (const to of recipients) {
      try {
        const result = await sendEmail({ to, subject, template });
        if (!result.success) {
          console.warn("[sponsorship-notify] sendEmail returned !success", {
            to,
            error: result.error,
          });
        }
      } catch (err) {
        console.warn("[sponsorship-notify] sendEmail threw — swallowing", {
          to,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    // Final catch-all — the webhook/payment must never be affected.
    console.error(
      "[sponsorship-notify] notify failed (payment unaffected)",
      err instanceof Error ? err.message : err,
    );
  }
}
