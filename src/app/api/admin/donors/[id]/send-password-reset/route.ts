// Session 65 — POST /api/admin/donors/[id]/send-password-reset
//
// Hands off to Directus's /auth/password/request for the donor's
// email. Directus generates the token + mails the link itself, so the
// donor receives the exact same email as if they'd used the donor-side
// forgot-password flow.
//
// Status mapping:
//   200 ok            — { donorId, email, triggeredAt }
//   400 invalid_state (donor has no email on file)
//   401 unauthorized
//   404 not_found
//   500 server_error  (Directus URL missing OR network error)

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  DonorNotFoundError,
  DonorWriteFailedError,
  InvalidDonorStateError,
  triggerDonorPasswordReset,
} from "@/lib/admin-donor-actions";

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
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const result = await triggerDonorPasswordReset(
      id,
      session.userId,
      req,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DonorNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidDonorStateError) {
      return NextResponse.json(
        { error: "invalid_state", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof DonorWriteFailedError) {
      console.error(
        "[/api/admin/donors/send-password-reset] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't trigger reset." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/donors/send-password-reset] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
