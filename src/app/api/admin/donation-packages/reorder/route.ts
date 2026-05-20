// Session 58.2-overnight Task 3 — POST /api/admin/donation-packages/reorder
//
// Bulk-update display_order from the admin drag-and-drop UI.
//
// Body: { items: [{ id, display_order }, ...] }
//
// Section integrity: all ids in a single call must share the same
// package_type. The /admin/donation-packages UI sorts monthly +
// one-time independently, so a cross-section drag is a UI bug.
// We re-validate server-side as a defensive cross-check.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import { reorderDonationPackages } from "@/lib/admin-donation-actions";
import {
  getPackageById,
  type PackageType,
} from "@/lib/donation-packages";

export const dynamic = "force-dynamic";

interface ReorderItem {
  id: string;
  display_order: number;
}
interface Body {
  items?: ReorderItem[];
}

export async function POST(req: NextRequest) {
  const session = await requireAdminUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length === 0) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }

  // Shape check.
  for (const it of items) {
    if (
      typeof it?.id !== "string" ||
      !it.id ||
      typeof it.display_order !== "number" ||
      !Number.isInteger(it.display_order)
    ) {
      return NextResponse.json(
        { error: "invalid_item", message: "each item needs id + integer display_order" },
        { status: 400 },
      );
    }
  }

  // Cross-section guard: all rows must share the same package_type.
  // Fetch the existing rows to read their types.
  let sharedType: PackageType | null = null;
  for (const it of items) {
    const pkg = await getPackageById(it.id, { includeInactive: true });
    if (!pkg) {
      return NextResponse.json(
        { error: "not_found", message: `package ${it.id} not found` },
        { status: 404 },
      );
    }
    if (sharedType === null) {
      sharedType = pkg.package_type;
    } else if (sharedType !== pkg.package_type) {
      return NextResponse.json(
        {
          error: "cross_section",
          message:
            "all reordered items must share the same package_type (monthly XOR one_time)",
        },
        { status: 400 },
      );
    }
  }

  try {
    await reorderDonationPackages({
      actorUserId: session.userId,
      items,
      request: req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server_error";
    console.error("[/api/admin/donation-packages/reorder]", message);
    return NextResponse.json(
      { error: "server_error", message },
      { status: 500 },
    );
  }
}
