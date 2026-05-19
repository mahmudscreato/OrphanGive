// Session 66 — POST /api/admin/children/[id]/archive
//
// Body: { reason: string }   (min 10, max 1000)
//
// Flips status='withdrawn' (the existing terminal value — see
// lifecycle note in admin-child-actions.ts). Donor-facing reads
// already filter that status out, so the row vanishes from public
// surfaces without losing data.
//
// Status mapping:
//   200 ok            — { childId, archivedAt }
//   400 bad_request   — body isn't JSON
//   400 invalid_state — reason too short/long OR child already archived
//   401 unauthorized
//   404 not_found
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  ChildNotFoundError,
  ChildWriteFailedError,
  InvalidChildStateError,
  archiveChildAsAdmin,
} from "@/lib/admin-child-actions";

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
    const result = await archiveChildAsAdmin(id, session.userId, reason, req);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ChildNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidChildStateError) {
      return NextResponse.json(
        { error: "invalid_state", message: err.message },
        { status: 400 },
      );
    }
    if (err instanceof ChildWriteFailedError) {
      console.error(
        "[/api/admin/children/archive] write_failed",
        err.message,
      );
      return NextResponse.json(
        { error: "write_failed", message: "Couldn't archive." },
        { status: 500 },
      );
    }
    console.error(
      "[/api/admin/children/archive] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
