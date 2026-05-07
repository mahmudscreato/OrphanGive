import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import { fetchDonorById, formatTo } from "@/lib/email-data";
import { DonorApprovedEmail } from "@/emails/DonorApprovedEmail";

export const runtime = "nodejs";

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

  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject: `Welcome to OrphanGive, ${firstName}`,
    template: DonorApprovedEmail({
      firstName,
      browseUrl: siteUrl("/children"),
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
