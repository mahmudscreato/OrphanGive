// Session 60 — admin "request changes" endpoint for a proposal.
//
// POST /api/admin/proposals/[id]/request-changes
// Body: { reason: string }   — REQUIRED, min 10 / max 1000 chars
//
// Soft alternative to reject: flips the proposal back to status='draft'
// so the DI sees it in their drafts queue and can edit + resubmit.
// Reason lands in `rejection_reason` (column doubles as admin-to-DI
// comments) and is included verbatim in the in-app notification body.
//
// Status mapping:
//   200 ok                 — { proposalId }
//   400 bad_request        — body missing / wrong shape / reason too short
//   400 invalid_status     — proposal not pending (race vs another admin)
//   401 unauthorized       — no admin session
//   404 not_found          — proposal doesn't exist
//   500 server_error       — Directus write failed

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  InvalidStatusError,
  NotFoundError,
  requestChangesOnProposal,
} from "@/lib/admin-proposals";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    // Min 10 ensures the DI has something actionable to read; max 1000
    // matches the textarea ceiling in ProposalActionBar's modal. Same
    // bounds the reject endpoint uses.
    reason: z.string().min(10).max(1000),
  })
  .strict();

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

  let json: unknown = undefined;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be valid JSON" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "bad_request",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await requestChangesOnProposal(
      id,
      adminSession.userId,
      parsed.data.reason,
    );
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
      "[/api/admin/proposals/request-changes] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
