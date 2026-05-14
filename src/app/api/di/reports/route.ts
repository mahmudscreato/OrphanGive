// Session 45 — DI reports POST endpoint.
//
// Body shape:
//   { childId, type, title, content, visibility, photoUuid? }
//
// Status mapping:
//   200 ok                  — { reportId }
//   400 invalid_input       — body shape OR data layer InvalidInputError
//   401 unauthorized
//   404 not_found           — childId out of scope
//   500 server_error
//
// Note: spec called for 409 duplicate-per-period, but production
// child_update has no period column — uniqueness gating dropped (see
// di-reports.ts header).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  createReport,
  InvalidInputError,
  OutOfScopeError,
} from "@/lib/di-reports";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    childId: z.string().uuid(),
    type: z.enum([
      "academic",
      "health",
      "story",
      "photo",
      "milestone",
      "eid_greeting",
      "letter",
    ]),
    title: z.string().min(1).max(200),
    content: z.string().min(50).max(2000),
    visibility: z.enum(["sponsor_only", "all_donors"]),
    photoUuid: z.string().min(8).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
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
    const { reportId } = await createReport(session.userId, parsed.data);
    return NextResponse.json({ reportId });
  } catch (err) {
    if (err instanceof OutOfScopeError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidInputError) {
      return NextResponse.json(
        {
          error: "invalid_input",
          field: err.field,
          message: err.message,
        },
        { status: 400 },
      );
    }
    console.error(
      "[/api/di/reports POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
