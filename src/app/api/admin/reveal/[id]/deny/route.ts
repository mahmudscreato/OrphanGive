// fix/reveal-decision-loop — POST /api/admin/reveal/[id]/deny
//
// ANY admin (requireAdminUser — NOT Super-Admin, per founder). Denies a
// pending reveal_request: sets status='denied' (the value the read
// path, donor UI, and reveal-denied email all key off), decided_by/at,
// and the admin note. Grants nothing (no approved_until). A non-empty
// reason is required. On success, best-effort fires RevealDeniedEmail.
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
import { denyRevealRequest, RevealRequestError } from "@/lib/reveal-data";
import { fireRevealDeniedEmail } from "@/lib/email-triggers";

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
    const result = await denyRevealRequest({
      requestId: id,
      adminUserId: session.userId,
      note: reason,
    });

    // Best-effort donor email — never unwinds the decision.
    try {
      await fireRevealDeniedEmail(result.id);
    } catch (err) {
      console.warn(
        "[/api/admin/reveal/deny] email failed (non-fatal)",
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
      "[/api/admin/reveal/deny] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
