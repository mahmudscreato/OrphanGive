import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, verifyInternalAuth } from "@/lib/email";
import {
  fetchChildById,
  fetchDonorById,
  fetchRevealRequestById,
  formatTo,
} from "@/lib/email-data";
import {
  REVEAL_FIELD_LABELS,
  isAllowedRevealField,
} from "@/lib/reveal-data";
import { RevealDeniedEmail } from "@/emails/RevealDeniedEmail";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  let body: { revealRequestId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = typeof body.revealRequestId === "string" ? body.revealRequestId : null;
  if (!id) {
    return NextResponse.json(
      { error: "revealRequestId is required" },
      { status: 400 },
    );
  }

  const reveal = await fetchRevealRequestById(id);
  if (!reveal) {
    return NextResponse.json({ error: "reveal request not found" }, { status: 404 });
  }
  if (reveal.status !== "denied") {
    return NextResponse.json(
      { error: `reveal request status is ${reveal.status}, expected 'denied'` },
      { status: 400 },
    );
  }
  const fieldLabel = isAllowedRevealField(reveal.field_name)
    ? REVEAL_FIELD_LABELS[reveal.field_name]
    : reveal.field_name;

  const [donor, child] = await Promise.all([
    fetchDonorById(reveal.donor),
    fetchChildById(reveal.child),
  ]);
  if (!donor || !donor.email) {
    return NextResponse.json(
      { error: "donor not found or has no email" },
      { status: 404 },
    );
  }
  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
  const childName = child?.display_name ?? "this child";

  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject: "Your reveal request — update from our team",
    template: RevealDeniedEmail({
      firstName,
      childName,
      fieldLabel,
      adminNote: reveal.admin_decision_note,
    }),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    success: true,
    messageId: result.messageId,
  });
}
