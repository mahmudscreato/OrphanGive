// Session 48a — DI school inline-create endpoint.
//
// POST /api/di/schools/create
// Body: { name, type?, bd_division?, bd_district?, notes? }
//
// Status mapping:
//   200 ok                      — { school }
//   400 bad_request             — body shape invalid
//   401 unauthorized
//   409 duplicate_school        — case-insensitive name match exists
//                                  (response includes existingId so the
//                                  modal can auto-select it instead)
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  createSchool,
  DuplicateSchoolError,
  SCHOOL_TYPES,
} from "@/lib/di-schools";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    name: z.string().min(2).max(200),
    type: z.enum(SCHOOL_TYPES as readonly [string, ...string[]]).optional(),
    bd_division: z.string().min(1).max(50).optional(),
    bd_district: z.string().min(1).max(50).optional(),
    notes: z.string().max(500).optional(),
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
    const school = await createSchool(session.userId, {
      name: parsed.data.name,
      ...(parsed.data.type
        ? { type: parsed.data.type as "school" | "madrasa" | "vocational" | "other" }
        : {}),
      ...(parsed.data.bd_division ? { bd_division: parsed.data.bd_division } : {}),
      ...(parsed.data.bd_district ? { bd_district: parsed.data.bd_district } : {}),
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    });
    return NextResponse.json({ school });
  } catch (err) {
    if (err instanceof DuplicateSchoolError) {
      return NextResponse.json(
        {
          error: "duplicate_school",
          existingId: err.existingId ?? null,
          message: err.message,
        },
        { status: 409 },
      );
    }
    console.error(
      "[/api/di/schools/create POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
