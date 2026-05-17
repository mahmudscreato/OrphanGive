// Session 46-fix-2 — admin proposal rejection endpoint.
//
// POST /api/admin/proposals/[id]/reject
// Body: { reason?: string }     — optional, max 1000 chars
//
// Sets status='rejected', approved_by=adminUserId, rejection_reason
// from body. No mutation on child. Audit admin_rejected_proposal.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  InvalidStatusError,
  NotFoundError,
  rejectProposal,
} from "@/lib/admin-proposals";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    reason: z.string().max(1000).optional(),
  })
  .strict()
  .or(z.undefined());

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminSession = await requireAdminUser();
  if (!adminSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Body is optional. Empty body = no reason.
  let json: unknown = undefined;
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    try {
      json = await req.json();
    } catch {
      // Treat parse failure as no body — reject can proceed without
      // a reason.
      json = undefined;
    }
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const reason = parsed.data?.reason;

  try {
    const result = await rejectProposal(id, adminSession.userId, reason);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidStatusError) {
      return NextResponse.json(
        { error: "invalid_status", message: err.message },
        { status: 400 },
      );
    }
    console.error(
      "[/api/admin/proposals/reject] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
