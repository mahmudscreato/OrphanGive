// Session 44 — DI proposal withdraw endpoint.
//
// Production status enum has no `withdrawn` value (see
// src/lib/di-proposals.ts header comment). Withdrawal is implemented
// as DELETE — `withdrawProposal` returns false on any of:
//   - proposal doesn't exist
//   - proposal isn't owned by this DI
//   - proposal isn't in `pending` status (already approved/rejected)
//
// All four miss-cases are collapsed into a single `cannot_withdraw`
// 400 response. The UI's WithdrawButton just shows a friendly retry
// message; reasoning further than that would require leaking
// information about the proposal's true state.

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import { withdrawProposal } from "@/lib/di-proposals";
// Session 46 — audit on every successful withdrawal.
import { recordAuditEvent } from "@/lib/di-audit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "cannot_withdraw" }, { status: 400 });
  }
  try {
    const ok = await withdrawProposal(id, session.userId);
    if (!ok) {
      return NextResponse.json({ error: "cannot_withdraw" }, { status: 400 });
    }
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_withdrew_proposal",
      collection: "child_proposal",
      recordId: id,
      // No childId metadata — by the time we audit, the proposal row
      // is deleted (withdrawal = DELETE per Session 44 design). The
      // proposal row is gone so we can't resolve the target child.
      // History tab on Child Detail won't show withdrawals; that's
      // acceptable since withdrawn proposals never made it to the
      // child anyway.
      request: req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      "[/api/di/proposals/[id]/withdraw POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
