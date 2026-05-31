import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import {
  fetchDonorById,
  formatTo,
  recentSentAtWithin,
  setDonorEmailSentAt,
} from "@/lib/email-data";
import { DonorApprovedEmail } from "@/emails/DonorApprovedEmail";

export const runtime = "nodejs";

// Server-side dedup window. Defense-in-depth — Directus Flows may also
// dedupe on their side, but this route is the source of truth.
const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  let body: { donorId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const donorId = typeof body.donorId === "string" ? body.donorId : null;
  if (!donorId) {
    return NextResponse.json(
      { error: "donorId is required" },
      { status: 400 },
    );
  }

  const donor = await fetchDonorById(donorId);
  if (!donor) {
    return NextResponse.json({ error: "donor not found" }, { status: 404 });
  }
  if (donor.og_admin_approval_status !== "approved") {
    return NextResponse.json(
      { error: `donor not approved (status=${donor.og_admin_approval_status})` },
      { status: 400 },
    );
  }
  if (!donor.email) {
    return NextResponse.json(
      { error: "donor has no email" },
      { status: 400 },
    );
  }

  // Dedup: if we sent this donor an approval email within the last 6h,
  // don't send another. 200 (not 4xx) so callers don't treat the noop as
  // a failure to retry.
  const recent = recentSentAtWithin(
    donor.approval_email_sent_at,
    DEDUP_WINDOW_MS,
  );
  if (recent) {
    return NextResponse.json({
      skipped: true,
      reason: "already_sent_recently",
      sentAt: recent,
    });
  }

  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject: `Welcome to OrphanGive, ${firstName} — you're in`,
    template: DonorApprovedEmail({
      firstName,
      browseUrl: siteUrl("/children"),
    }),
  });

  if (!result.success) {
    // Do NOT mark sent — let the next call retry.
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Best-effort timestamp write. If this fails the email still went out;
  // worst case is one duplicate within the next 6h. Errors logged inside.
  await setDonorEmailSentAt(donor.id, "approval_email_sent_at");

  return NextResponse.json({
    success: true,
    messageId: result.messageId,
  });
}
