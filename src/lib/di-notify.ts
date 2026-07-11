// Session 46 — admin notification helper for pending DI submissions.
//
// Sends one email per submission to every address in
// ADMIN_NOTIFY_EMAILS (comma-separated). Wraps the existing Resend
// helper from src/lib/email.ts; uses the AdminPendingSubmissionEmail
// React Email template.
//
// Failure mode: NEVER fail the parent operation if email sending
// fails. We log to console.warn and swallow.
//
// Privacy: emails carry the DI's first name and the child's
// display_name (data the DI is permitted to see). NO donor PII, NO
// sponsorship details, NO photo URLs. The body links to Directus
// admin where authorised reviewers see the full row.

import "server-only";

import { readItems, readUsers } from "@directus/sdk";
import React from "react";
import { directusServer } from "./directus";
import { sendEmail } from "./email";
import { AdminPendingSubmissionEmail } from "@/emails/AdminPendingSubmissionEmail";

// ─── Public types ───────────────────────────────────────────────────

export type SubmissionCollection =
  | "child_proposal"
  | "child_moment"
  | "child_update"
  | "aid_delivery"
  // fix/task-fulfillment-loop — the DI-completed-a-task event + the
  // unassigned-auto-task alert both reach admins through this path.
  | "task"
  // fix/reveal-decision-loop — a donor's Tier-3 information-access
  // request notifies admins to review it in the reveal queue.
  | "reveal_request";

export interface NotifyAdminInput {
  collection: SubmissionCollection;
  recordId: string;
  submittedByUserId: string;
  childId?: string;
  // One-line summary used in the email subject + first paragraph
  // (e.g. "New moment: 'First day at school'"). Keep short — admin
  // sees this in their inbox preview.
  summary: string;
}

// ─── Internal helpers ───────────────────────────────────────────────

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFY_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes("@"));
}

function getDirectusAdminBase(): string {
  // The /admin URL space is hosted on the Directus instance itself.
  // In local dev this is http://localhost:8055; in production it's
  // https://admin.orphangive.org. Reuse NEXT_PUBLIC_DIRECTUS_URL.
  return (
    process.env.NEXT_PUBLIC_DIRECTUS_URL?.replace(/\/$/, "") ??
    "https://admin.orphangive.org"
  );
}

const COLLECTION_LABEL: Record<SubmissionCollection, string> = {
  child_proposal: "child profile change",
  child_moment: "moment",
  child_update: "report",
  aid_delivery: "delivery",
  task: "delivery task",
  reveal_request: "information-access request",
};

async function resolveSubmitterFirstName(
  userId: string,
): Promise<string> {
  try {
    const users = (await directusServer().request(
      readUsers({
        filter: { id: { _eq: userId } },
        fields: ["first_name"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ first_name: string | null }> | undefined;
    const name = users?.[0]?.first_name?.trim();
    return name && name.length > 0 ? name : "A data inputter";
  } catch (err) {
    console.warn(
      "[di-notify] submitter name resolution failed",
      err instanceof Error ? err.message : err,
    );
    return "A data inputter";
  }
}

async function resolveChildDisplayName(
  childId: string | undefined,
): Promise<string | null> {
  if (!childId) return null;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["display_name"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ display_name: string | null }> | undefined;
    return rows?.[0]?.display_name?.trim() ?? null;
  } catch (err) {
    console.warn(
      "[di-notify] child name resolution failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Email every address in ADMIN_NOTIFY_EMAILS that a new pending
 * submission exists. No-op (with a warn) when the env var is missing
 * or empty. Always returns void; never throws into the caller.
 *
 * Caller order should be:
 *   1. Do the actual create (createMoment / createProposal / etc.)
 *   2. recordAuditEvent({ ... })
 *   3. notifyAdminOfPendingSubmission({ ... })
 *   4. Return success to the client
 */
export async function notifyAdminOfPendingSubmission(
  input: NotifyAdminInput,
): Promise<void> {
  const recipients = getAdminEmails();
  if (recipients.length === 0) {
    console.warn(
      "[di-notify] ADMIN_NOTIFY_EMAILS not set — skipping notification",
      { collection: input.collection, recordId: input.recordId },
    );
    return;
  }

  const [submitterFirstName, childDisplayName] = await Promise.all([
    resolveSubmitterFirstName(input.submittedByUserId),
    resolveChildDisplayName(input.childId),
  ]);

  const collectionLabel = COLLECTION_LABEL[input.collection];
  const reviewUrl = `${getDirectusAdminBase()}/admin/content/${input.collection}/${input.recordId}`;

  const subject = childDisplayName
    ? `[OrphanGive admin] New ${collectionLabel} from ${submitterFirstName} for ${childDisplayName}`
    : `[OrphanGive admin] New ${collectionLabel} from ${submitterFirstName}`;

  const template = React.createElement(AdminPendingSubmissionEmail, {
    collectionLabel,
    submitterFirstName,
    childDisplayName,
    summary: input.summary,
    reviewUrl,
  });

  // Send sequentially so one Resend rate limit doesn't cascade-fail
  // multiple recipients. With < 5 admins this is fine.
  for (const to of recipients) {
    try {
      const result = await sendEmail({
        to,
        subject,
        template,
      });
      if (!result.success) {
        console.warn("[di-notify] sendEmail returned !success", {
          to,
          error: result.error,
        });
      }
    } catch (err) {
      console.warn("[di-notify] sendEmail threw — swallowing", {
        to,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
