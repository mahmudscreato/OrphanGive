// Session 34 Part C — developer-only endpoint that renders one of
// the transactional email templates with sample data and sends it
// to mahmud@printagraphy.com via the same Resend pipeline production
// uses. The point is to give Mahmud a one-click way to see every
// template in his real inbox before the visual rebrand pass starts.
//
// Hard rules:
//   • Gated on NEXT_PUBLIC_DEV_TOOLS_ENABLED === "true". If the env
//     var isn't set, the route returns 404 — production never sees
//     this route surface.
//   • Recipient is hard-coded to mahmud@printagraphy.com. The route
//     ignores any "to" field in the body. (If we ever need to send
//     these to someone else, that's a code change, not a runtime
//     decision — keeps misuse impossible.)
//   • Subject prefix is `[TEST] ` so they're trivially distinguishable
//     from real production sends in inbox search.
//   • Accepts `{ template: string }` or `{ template: "ALL" }`. ALL
//     iterates the whole registry sequentially with a small delay
//     between sends to stay under Resend's 2-req/sec rate limit.
//
// TODO: fold into OPS_RUNBOOK.md after Session 30 merges to main —
// section "Testing transactional emails" with a one-line note about
// /dev/email-review being the entry point.

import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import { EMAIL_SAMPLES, getSampleById } from "@/lib/dev-email-samples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_RECIPIENT = "mahmud@printagraphy.com";
const SUBJECT_PREFIX = "[TEST] ";

// Resend free tier is 2 req/sec. We pause 600ms between sends in
// the ALL flow to stay comfortably under that ceiling even if the
// Resend client adds its own latency.
const ALL_SEND_DELAY_MS = 600;

function devToolsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_TOOLS_ENABLED === "true";
}

function notFound() {
  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

type SendOne = {
  id: string;
  title: string;
  success: boolean;
  messageId?: string;
  error?: string;
};

async function sendOneSample(id: string): Promise<SendOne> {
  const sample = getSampleById(id);
  if (!sample) {
    return { id, title: id, success: false, error: "Unknown template id" };
  }
  try {
    const result = await sendEmail({
      to: TEST_RECIPIENT,
      subject: `${SUBJECT_PREFIX}${sample.subject}`,
      template: sample.render(),
    });
    if (result.success) {
      return {
        id: sample.id,
        title: sample.title,
        success: true,
        messageId: result.messageId,
      };
    }
    return {
      id: sample.id,
      title: sample.title,
      success: false,
      error: result.error,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown render error";
    return { id: sample.id, title: sample.title, success: false, error: msg };
  }
}

export async function POST(req: NextRequest) {
  if (!devToolsEnabled()) return notFound();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  if (!body || typeof body !== "object") return badRequest("Invalid body.");
  const template = (body as { template?: unknown }).template;
  if (typeof template !== "string" || !template.trim()) {
    return badRequest("Missing `template`.");
  }

  // Single send.
  if (template !== "ALL") {
    const result = await sendOneSample(template);
    if (!result.success) {
      console.error("[/api/dev/send-test-email] send failed:", result);
      return NextResponse.json(
        { ok: false, results: [result] },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, results: [result] });
  }

  // Batch send — sequential with delay so we don't trip rate limits.
  const results: SendOne[] = [];
  for (const sample of EMAIL_SAMPLES) {
    const r = await sendOneSample(sample.id);
    results.push(r);
    if (!r.success) {
      console.error("[/api/dev/send-test-email] batch send failed:", r);
    }
    await new Promise((resolve) => setTimeout(resolve, ALL_SEND_DELAY_MS));
  }

  const allOk = results.every((r) => r.success);
  return NextResponse.json(
    { ok: allOk, results },
    { status: allOk ? 200 : 502 },
  );
}

export async function GET() {
  if (!devToolsEnabled()) return notFound();
  return NextResponse.json({
    ok: true,
    recipient: TEST_RECIPIENT,
    samples: EMAIL_SAMPLES.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      subject: `${SUBJECT_PREFIX}${s.subject}`,
    })),
  });
}
