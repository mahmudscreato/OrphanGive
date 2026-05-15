// Session 46-fix-2 — admin login endpoint.
//
// Mirror of /api/di/login. Posts {email, password} as JSON; on success
// sets `admin_access_token` + `admin_refresh_token` cookies separately
// from the DI cookie pair. Body returned: { ok: true, user: { ... } }.
//
// V1: no admin login UI exists. Mahmud uses curl per APPLY.md.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { loginAdmin, setAdminCookies } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z
  .object({
    email: z.string().email().max(200),
    password: z.string().min(1).max(200),
  })
  .strict();

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await loginAdmin(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    if (result.error === "invalid_credentials") {
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 401 },
      );
    }
    if (result.error === "not_admin") {
      return NextResponse.json(
        { error: "not_admin", message: "User is not an admin." },
        { status: 403 },
      );
    }
    console.error(
      "[/api/admin/login] server_error:",
      result.message ?? "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const store = await cookies();
  setAdminCookies(store, result.accessToken, result.refreshToken);

  return NextResponse.json({
    ok: true,
    user: {
      id: result.user.userId,
      email: result.user.email,
      first_name: result.user.firstName,
      last_name: result.user.lastName,
      role_name: result.user.roleName,
    },
  });
}
