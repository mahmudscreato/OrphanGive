// P4 — admin notes endpoint for a partnership inquiry.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import { setPartnershipInquiryNotes } from "@/lib/partnership-inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ notes: z.string().max(4000) })
  .strict();

const ID_RE = /^([0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id || !ID_RE.test(id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await setPartnershipInquiryNotes(id, parsed.data.notes, session.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      "[/api/admin/partnership-inquiries/[id]/notes] failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
