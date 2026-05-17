// Session 45 — DI moments POST endpoint.
//
// Body shape (zod-validated):
//   { childId, caption, takenAt (YYYY-MM-DD), mediaType: 'image'|'video',
//     fileUuid, durationSeconds? }
//
// Status mapping:
//   200 ok                      — { momentId }
//   400 invalid_input / bad_req — body shape OR data layer InvalidInputError
//   401 unauthorized
//   404 not_found               — childId out of scope (collapsed)
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  createMoment,
  InvalidInputError,
  OutOfScopeError,
} from "@/lib/di-moments";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    childId: z.string().uuid(),
    caption: z.string().min(1).max(200),
    takenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mediaType: z.enum(["image", "video"]),
    fileUuid: z.string().min(8),
    durationSeconds: z.number().int().min(1).max(60).optional(),
  })
  .strict()
  .refine(
    (v) => v.mediaType !== "video" || v.durationSeconds !== undefined,
    { message: "durationSeconds required for video", path: ["durationSeconds"] },
  );

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
    // createMoment takes the whole session because it needs the DI's
    // access token to issue the create call as the DI user (works
    // around the user-created auto-fill on child_moment.created_by;
    // see di-moments.ts header).
    const { momentId } = await createMoment(
      { userId: session.userId, accessToken: session.accessToken },
      parsed.data,
    );
    return NextResponse.json({ momentId });
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
      "[/api/di/moments POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
