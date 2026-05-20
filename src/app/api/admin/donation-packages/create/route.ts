// Session 58.2 — POST /api/admin/donation-packages/create
//
// Body: full PackageInput. Validates server-side via createDonationPackage.
// Returns { id } on success. Audits as admin_created_donation_package.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  createDonationPackage,
  type PackageInput,
} from "@/lib/admin-donation-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: PackageInput;
  try {
    body = (await req.json()) as PackageInput;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    const { id } = await createDonationPackage({
      actorUserId: session.userId,
      input: body,
      request: req,
    });
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server_error";
    console.error("[/api/admin/donation-packages/create]", message);
    return NextResponse.json({ error: "invalid_input", message }, { status: 400 });
  }
}
