// fix/reveal-decision-loop — POST /api/admin/reveal/[id]/approve
//
// ANY admin (requireAdminUser — NOT Super-Admin, per founder). Approves
// a pending reveal_request: sets status='approved', decided_by/at, the
// admin note, AND approved_until = now + 90d (the read-path bound the
// donor's getActiveReveals requires). A non-empty reason is required.
// On success, best-effort fires RevealApprovedEmail to the donor.
//
// Body: { reason: string }  (>= 3 chars after trim)
//
// Status mapping:
//   200 ok            — { ok, id, donorId, childId, fieldName }
//   400 bad_request   — body not JSON / reason missing
//   401 unauthorized
//   404 not_found     — request id unknown
//   409 conflict      — request already decided (not pending)
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { approveRevealRequest, RevealRequestError } from "@/lib/reveal-data";
import { fireRevealApprovedEmail } from "@/lib/email-triggers";

export const runtime = "nodejs";
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

  let body: { reason?: unknown };
  try {
    body = (await req.json()) as { reason?: unknown };
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const reason = typeof body.reason === "string" ? body.reason : "";

  try {
    const result = await approveRevealRequest({
      requestId: id,
      adminUserId: session.userId,
      note: reason,
    });

    // Best-effort donor email — never unwinds the decision.
    try {
      await fireRevealApprovedEmail(result.id);
    } catch (err) {
      console.warn(
        "[/api/admin/reveal/approve] email failed (non-fatal)",
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RevealRequestError) {
      return NextResponse.json(
        { error: err.status === 409 ? "conflict" : "bad_request", message: err.message },
        { status: err.status },
      );
    }
    console.error(
      "[/api/admin/reveal/approve] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
