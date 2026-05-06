import { NextResponse, type NextRequest } from "next/server";
import { getCurrentDonor } from "@/lib/donor-data";
import {
  RevealRequestError,
  withdrawRevealRequest,
} from "@/lib/reveal-data";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const donor = await getCurrentDonor();
  if (!donor) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;
  try {
    await withdrawRevealRequest({ donorId: donor.id, requestId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof RevealRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/reveal/withdraw] unexpected", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
