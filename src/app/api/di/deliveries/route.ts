// Session 45 — DI deliveries POST endpoint.
//
// Body shape:
//   { childId, sponsorshipId?, aidType, description, deliveryDate,
//     photoUuid, recipientAcknowledgment? }
//
// Status mapping:
//   200 ok                           — { deliveryId }
//   400 invalid_input / sponsor_mis  — body shape OR data layer error
//   401 unauthorized
//   404 not_found                    — childId out of scope (collapsed)
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  createDelivery,
  InvalidInputError,
  OutOfScopeError,
  SponsorshipNotMatchingError,
} from "@/lib/di-deliveries";
// Session 46 — audit + admin notify on every successful delivery.
import { recordAuditEvent } from "@/lib/di-audit";
import { notifyAdminOfPendingSubmission } from "@/lib/di-notify";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    childId: z.string().uuid(),
    sponsorshipId: z.string().uuid().optional(),
    aidType: z.enum([
      "education",
      "food",
      "healthcare",
      "clothing",
      "general_care",
      "other",
    ]),
    description: z.string().min(1).max(500),
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    photoUuid: z.string().min(8),
    recipientAcknowledgment: z.string().max(1000).optional(),
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
    const { deliveryId } = await createDelivery(session.userId, parsed.data);
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_marked_delivery",
      collection: "aid_delivery",
      recordId: deliveryId,
      metadata: {
        childId: parsed.data.childId,
        aidType: parsed.data.aidType,
        ...(parsed.data.sponsorshipId
          ? { sponsorshipId: parsed.data.sponsorshipId }
          : {}),
      },
      request: req,
    });
    await notifyAdminOfPendingSubmission({
      collection: "aid_delivery",
      recordId: deliveryId,
      submittedByUserId: session.userId,
      childId: parsed.data.childId,
      summary: `New ${parsed.data.aidType} delivery: "${parsed.data.description.slice(0, 60)}"`,
    });
    return NextResponse.json({ deliveryId });
  } catch (err) {
    if (err instanceof OutOfScopeError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof SponsorshipNotMatchingError) {
      return NextResponse.json(
        { error: "sponsorship_not_matching", message: err.message },
        { status: 400 },
      );
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
      "[/api/di/deliveries POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
