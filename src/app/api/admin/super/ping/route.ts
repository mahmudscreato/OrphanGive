// Phase 0 — Super Admin gate proof surface.
//
// Read-only, non-destructive. The whole point of this endpoint is to
// verify end-to-end that the Super Admin distinction is wired:
//
//   no admin cookie       → 401 unauthorized
//   plain Admin/Administrator session → 403 forbidden
//   Super Admin session              → 200 { ok: true, role: <name> }
//
// V1 stops here intentionally — the wider can/cannot permission
// matrix across all admin routes is a later RBAC phase. This endpoint
// proves the requireSuperAdminUser() mechanism works so that phase
// can fan it out with confidence.

import { NextResponse } from "next/server";
import {
  requireAdminUser,
  requireSuperAdminUser,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const superAdmin = await requireSuperAdminUser();
  if (superAdmin) {
    return NextResponse.json({
      ok: true,
      role: superAdmin.roleName,
      isSuperAdmin: true,
    });
  }
  // Not a super admin. Distinguish "no session at all" (401) from
  // "valid admin session but wrong tier" (403). The matrix-fanout
  // phase will adopt the same shape.
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401 },
    );
  }
  return NextResponse.json(
    {
      error: "forbidden",
      message: "Super Admin role required.",
      role: admin.roleName,
      isSuperAdmin: false,
    },
    { status: 403 },
  );
}
