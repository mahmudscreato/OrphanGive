// Session 44 — DI proposal detail endpoint (GET).
// Session 48b — extended with PATCH (update draft) and DELETE
// (discard draft). Both are draft-only — the data layer functions
// reject anything in non-draft status, so we don't risk
// accidentally mutating a pending/approved proposal here.
//
// Returns the full proposal record (including computed diff for
// UPDATE proposals) when owned by the authenticated DI. 404 collapses
// "not owned" with "not exists" so the API never reveals which
// proposal IDs the DI is or isn't allowed to see.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  discardDraftProposal,
  getProposalForUser,
  OutOfScopeError,
  updateDraftProposal,
} from "@/lib/di-proposals";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const proposal = await getProposalForUser(id, session.userId);
    if (!proposal) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ proposal });
  } catch (err) {
    console.error(
      "[/api/di/proposals/[id] GET] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// Session 48b — PATCH the draft. Loose validation: any subset of
// editable fields is accepted. Update fails with 404 if the row
// isn't owned OR isn't in draft status (collapsed for privacy).

const patchDraftBodySchema = z
  .object({
    fields: z.record(z.string(), z.unknown()).default({}),
    photoUuid: z.string().min(8).nullable().optional(),
    // Session 51.5 — the form reuses one buildDraftBody() for both
    // POST (new draft) and PATCH (existing draft) and always sends
    // these three discriminator/context keys. We accept-and-ignore
    // them here: the URL [id] is the authoritative target, and
    // operation is implied by the existing draft row (you can't
    // morph a CREATE draft into an UPDATE via PATCH anyway). Without
    // this allowance, the .strict() guard rejected every save with
    // "Couldn't save your draft".
    mode: z.literal("draft").optional(),
    operation: z.enum(["create", "update"]).optional(),
    childId: z.string().uuid().optional(),
  })
  .strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = patchDraftBodySchema.safeParse(json);
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
    await updateDraftProposal(
      session.userId,
      id,
      parsed.data.fields,
      parsed.data.photoUuid,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OutOfScopeError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error(
      "[/api/di/proposals/[id] PATCH] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// Session 48b — DELETE the draft. Hard delete (drafts have no
// audit history to preserve). Same 404-collapse for not-owned /
// not-found / not-draft.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ok = await discardDraftProposal(session.userId, id);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
