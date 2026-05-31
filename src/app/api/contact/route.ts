// Session 32 — single API route handling three form-submission
// shapes: general contact, orphan referral, volunteer
// application. All three render the shared OperationalNoticeEmail
// template and send via Resend to support@orphangive.org.
//
// Why one route, three shapes: the three forms collect different
// fields but share the same delivery semantics (email to support
// inbox, success/failure handling, reply-to wiring). Folding the
// branching into the route keeps the wire-protocol surface small
// and lets each form post a `kind` discriminator without
// duplicating server logic.
//
// TODO: future feature — guardian dashboard for profile
// submission flow. The orphan-referral path here is the v1 entry
// point; v2 graduates this to an authenticated guardian
// account → child profile draft → admin review pipeline.
// (Tracked in Session 17.5 Bucket C.)

import { NextResponse, type NextRequest } from "next/server";
import type { ReactElement } from "react";
import { createItem } from "@directus/sdk";
import { sendEmail } from "@/lib/email";
import { directusServer } from "@/lib/directus";
import {
  OperationalNoticeEmail,
  type OperationalSection,
} from "@/emails/OperationalNoticeEmail";
// Form-acks lot — submitter acknowledgement templates. One per
// form kind. Built inside the kind branches below so each picks
// up only the data its template actually needs.
import { ContactFormAckEmail } from "@/emails/ContactFormAckEmail";
import { OrphanReferralAckEmail } from "@/emails/OrphanReferralAckEmail";
import { VolunteerAckEmail } from "@/emails/VolunteerAckEmail";

export const runtime = "nodejs";

// Session 34 Part B — every form submission also writes to the
// Directus `form_submission` collection. The Resend email and the
// Directus write are independent; either succeeding is enough for
// the user to see a success state. See
// DIRECTUS_FORM_SUBMISSION_SCHEMA.md for the collection shape.
type FormSubmissionType =
  | "contact_general"
  | "orphan_referral"
  | "volunteer_application";

async function writeFormSubmission(args: {
  submission_type: FormSubmissionType;
  submitter_name: string;
  submitter_email: string;
  submitter_phone?: string;
  subject: string;
  message: string;
  payload_json: unknown;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await directusServer().request(
      createItem("form_submission" as never, {
        ...args,
        status: "new",
      } as never),
    );
    return { success: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "unknown form_submission error";
    console.error("[/api/contact] form_submission write failed:", msg);
    return { success: false, error: msg };
  }
}

const SUPPORT_EMAIL = "support@orphangive.org";

const SUBJECT_LABEL: Record<string, string> = {
  sponsorship: "Sponsorship question",
  technical: "Technical issue",
  press: "Press inquiry",
  partnership: "Partnership",
  orphan_referral: "I know an orphan who needs support",
  other: "Other",
};

type GeneralPayload = {
  kind: "contact";
  name: string;
  email: string;
  subject: string;
  message: string;
};

type OrphanReferralPayload = {
  kind: "orphan_referral";
  name: string;
  email: string;
  message: string;
  orphan: {
    relationship: string;
    childFirstName: string;
    childAge: string;
    childLocation: string;
    description: string;
  };
};

type VolunteerPayload = {
  kind: "volunteer";
  name: string;
  email: string;
  phone?: string;
  location: string;
  skills: string[];
  skillsOther?: string;
  availability: string;
  motivation?: string;
};

type Payload = GeneralPayload | OrphanReferralPayload | VolunteerPayload;

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function emailLooksValid(e: unknown): e is string {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  if (!body || typeof body !== "object") return badRequest("Invalid body.");
  const p = body as Partial<Payload>;
  const kind = p.kind;

  if (
    kind !== "contact" &&
    kind !== "orphan_referral" &&
    kind !== "volunteer"
  ) {
    return badRequest("Unknown submission kind.");
  }

  if (!isString(p.name)) return badRequest("Name is required.");
  if (!emailLooksValid(p.email)) return badRequest("Valid email required.");

  // --- branch by kind, build the email payload --------------------
  let subject: string;
  let heading: string;
  let eyebrow: string | null = null;
  let intro: string | null = null;
  let sections: OperationalSection[] = [];
  // Form-acks lot — per-kind submitter ack. Built inline below
  // because each ack template needs different fields from the
  // (already-validated) payload. ackSubject + ackTemplate are
  // dispatched in parallel with the admin alert at the bottom.
  let ackSubject: string;
  let ackTemplate: ReactElement;
  const senderName = p.name!.trim();
  const senderEmail = p.email!.trim();

  if (kind === "contact") {
    const c = p as Partial<GeneralPayload>;
    if (!isString(c.subject)) return badRequest("Subject is required.");
    if (!isString(c.message) || c.message!.trim().length < 5) {
      return badRequest("Message is required.");
    }
    const subjectLabel = SUBJECT_LABEL[c.subject!] ?? "Other";
    subject = `Contact form: ${subjectLabel}`;
    heading = `New contact form message`;
    eyebrow = subjectLabel;
    intro = `From ${senderName} (${senderEmail}).`;
    sections = [
      { label: "Submitted by", body: `${senderName}\n${senderEmail}` },
      { label: "Subject", body: subjectLabel },
      { label: "Message", body: c.message!.trim() },
    ];
    ackSubject = `We got your message — thanks for getting in touch`;
    ackTemplate = ContactFormAckEmail({ senderName, subjectLabel });
  } else if (kind === "orphan_referral") {
    const o = p as Partial<OrphanReferralPayload>;
    const orphan = o.orphan;
    if (!orphan || typeof orphan !== "object") {
      return badRequest("Orphan details required.");
    }
    if (!isString(orphan.relationship)) return badRequest("Relationship required.");
    if (!isString(orphan.childFirstName)) return badRequest("Child first name required.");
    if (!isString(orphan.childAge)) return badRequest("Child age required.");
    if (!isString(orphan.childLocation)) return badRequest("Child location required.");
    if (!isString(orphan.description) || orphan.description.trim().length < 5) {
      return badRequest("Description required.");
    }
    subject = `[ORPHAN REFERRAL] ${senderName} - ${orphan.childFirstName.trim()}`;
    heading = "New orphan profile referral";
    eyebrow = "Orphan referral";
    intro = `${senderName} (${senderEmail}) has referred a child for OrphanGive verification.`;
    sections = [
      { label: "Submitted by", body: `${senderName}\n${senderEmail}` },
      { label: "Relationship to child", body: orphan.relationship.trim() },
      { label: "Child's first name", body: orphan.childFirstName.trim() },
      { label: "Child's approximate age", body: orphan.childAge.trim() },
      { label: "Child's location", body: orphan.childLocation.trim() },
      { label: "Situation description", body: orphan.description.trim() },
      ...(o.message && isString(o.message)
        ? [{ label: "Additional message", body: o.message.trim() }]
        : []),
    ];
    ackSubject = `We received your referral — thank you`;
    ackTemplate = OrphanReferralAckEmail({
      senderName,
      childFirstName: orphan.childFirstName.trim(),
    });
  } else {
    // volunteer
    const v = p as Partial<VolunteerPayload>;
    if (!isString(v.location)) return badRequest("Location is required.");
    if (!Array.isArray(v.skills) || v.skills.length === 0) {
      return badRequest("Select at least one skill / interest.");
    }
    if (!isString(v.availability)) return badRequest("Availability is required.");
    const skillsLine =
      v.skills.includes("other") && v.skillsOther
        ? `${v.skills.filter((s) => s !== "other").join(", ")} — Other: ${v.skillsOther.trim()}`
        : v.skills.join(", ");
    subject = `[VOLUNTEER APPLICATION] ${senderName}`;
    heading = "New volunteer application";
    eyebrow = "Volunteer application";
    intro = `${senderName} (${senderEmail}) wants to volunteer with OrphanGive.`;
    sections = [
      { label: "Submitted by", body: `${senderName}\n${senderEmail}` },
      ...(isString(v.phone)
        ? [{ label: "Phone", body: v.phone!.trim() }]
        : []),
      { label: "Location", body: v.location!.trim() },
      { label: "Skills & interests", body: skillsLine },
      { label: "Availability", body: v.availability!.trim() },
      ...(isString(v.motivation)
        ? [{ label: "Motivation", body: v.motivation!.trim() }]
        : []),
    ];
    ackSubject = `Thank you for offering to help`;
    ackTemplate = VolunteerAckEmail({
      senderName,
      skillsSummary: skillsLine,
    });
  }

  // --- Session 34 Part B — derive the form_submission row shape
  //     from the same payload the email used. payload_json is the
  //     full original `body`; structured fields surface the common
  //     filterable values for the admin panel.
  const submissionType: FormSubmissionType =
    kind === "contact"
      ? "contact_general"
      : kind === "orphan_referral"
        ? "orphan_referral"
        : "volunteer_application";

  const phone =
    kind === "volunteer" && isString((p as Partial<VolunteerPayload>).phone)
      ? (p as Partial<VolunteerPayload>).phone!.trim()
      : undefined;

  const messageField =
    kind === "contact"
      ? (p as Partial<GeneralPayload>).message?.trim() ?? ""
      : kind === "orphan_referral"
        ? (p as Partial<OrphanReferralPayload>).orphan?.description?.trim() ??
          ""
        : (p as Partial<VolunteerPayload>).motivation?.trim() ?? "";

  // --- run admin-alert email + DB write + submitter ack in parallel ---
  // Three independent channels:
  //   1. emailResult     — admin alert to support@ via OperationalNoticeEmail
  //   2. dbResult        — form_submission row write to Directus
  //   3. ackResult       — submitter acknowledgement (form-acks lot, per-kind)
  // The first two gate the user-facing success response (either is
  // enough). The third is best-effort — failure logs but never fails
  // the request because the user already SAW the success state.
  const [emailResult, dbResult, ackResult] = await Promise.all([
    sendEmail({
      to: SUPPORT_EMAIL,
      subject,
      template: OperationalNoticeEmail({
        heading,
        eyebrow,
        intro,
        sections,
        replyToNudge: senderEmail,
      }),
      replyTo: senderEmail,
    }),
    writeFormSubmission({
      submission_type: submissionType,
      submitter_name: senderName,
      submitter_email: senderEmail,
      ...(phone ? { submitter_phone: phone } : {}),
      subject,
      message: messageField,
      payload_json: body,
    }),
    sendEmail({
      to: senderEmail,
      subject: ackSubject,
      template: ackTemplate,
    }),
  ]);

  if (!emailResult.success) {
    console.error("[/api/contact] Resend send failed:", {
      kind,
      to: SUPPORT_EMAIL,
      subject,
      error: emailResult.error,
    });
  }
  if (!dbResult.success) {
    console.error("[/api/contact] form_submission write failed:", dbResult.error);
  }
  if (!ackResult.success) {
    // Best-effort — log only. Admin and DB already have the
    // submission; the submitter just won't see an ack.
    console.warn("[/api/contact] submitter ack send failed:", {
      kind,
      to: senderEmail,
      error: ackResult.error,
    });
  }

  // Success if EITHER channel succeeded — Mahmud always has at
  // least one record of the submission.
  if (emailResult.success || dbResult.success) {
    return NextResponse.json({ ok: true });
  }

  // BOTH failed — only then surface a user-facing error. Surface
  // the real cause in dev so the developer sees it; production
  // keeps the user-friendly fallback message so we don't leak
  // internals (quota / domain verification / DB schema).
  const isProd = process.env.NODE_ENV === "production";
  const debugMsg = `email=${emailResult.success ? "ok" : (emailResult as { error: string }).error} | db=${dbResult.success ? "ok" : dbResult.error}`;
  return NextResponse.json(
    {
      ok: false,
      error: isProd
        ? "Sorry, we couldn't send your message right now. Please email us directly at support@orphangive.org."
        : `[dev] Both channels failed. ${debugMsg}`,
    },
    { status: 502 },
  );
}
