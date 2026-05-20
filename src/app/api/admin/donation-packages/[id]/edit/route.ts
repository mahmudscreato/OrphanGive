// Session 58.2 — POST /api/admin/donation-packages/[id]/edit
//
// Body: Partial<PackageInput>. Validates against the existing row +
// the patch via updateDonationPackage. Audits per-field diff.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  updateDonationPackage,
  type PackageInput,
} from "@/lib/admin-donation-actions";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let body: Partial<PackageInput>;
  try {
    body = (await req.json()) as Partial<PackageInput>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    await updateDonationPackage({
      actorUserId: session.userId,
      id,
      patch: body,
      request: req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server_error";
    if (message === "Package not found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[/api/admin/donation-packages/edit]", message);
    return NextResponse.json({ error: "invalid_input", message }, { status: 400 });
  }
}
