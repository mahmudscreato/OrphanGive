// POST /api/safeguarding-report — PUBLIC safeguarding report intake.
//
// Anyone (incl. a child or bystander, NO login) can submit a concern.
// All reporter fields are OPTIONAL — anonymous reports are allowed and
// must work. Only report_type + description are required.
//
// The report is written to the fail-closed safeguarding_report collection
// (via the server token; no user policy can read it). risk_level / status
// / action_taken are NOT reporter-facing — the lead sets those later.
//
// Spam control mirrors /api/partnership-inquiry: honeypot + per-IP rate
// limit. Privacy: the description is stored in Directus ONLY — never
// logged, and the admin alert email carries NO case details (just "a
// report arrived" + a link to the gated queue).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSafeguardingReport } from "@/lib/safeguarding-reports";
import { REPORT_TYPES, REPORT_TYPE_LABELS } from "@/lib/safeguarding-report-types";
import { sendEmail } from "@/lib/email";
import { OperationalNoticeEmail } from "@/emails/OperationalNoticeEmail";
import { SafeguardingReportAckEmail } from "@/emails/SafeguardingReportAckEmail";

// FLAG: admin@orphangive.org must exist + route. The feature must never
// silently alert a dead inbox (see the "inboxes to confirm" list).
const SAFEGUARDING_ALERT_EMAIL = "admin@orphangive.org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z
  .object({
    report_type: z.enum(REPORT_TYPES),
    description: z
      .string()
      .trim()
      .min(20, "Please describe the concern (20+ characters).")
      .max(5000),
    // All reporter fields optional — anonymous reporting is allowed.
    reporter_name: z.string().trim().max(120).optional().or(z.literal("")),
    reporter_email: z
      .string()
      .trim()
      .max(254)
      .email("Invalid email.")
      .optional()
      .or(z.literal("")),
    reporter_relationship: z.string().trim().max(120).optional().or(z.literal("")),
    child_reference: z.string().trim().max(2000).optional().or(z.literal("")),
    // Honeypot — accepted by schema, silently 200'd in the handler.
    website: z.string().max(200).optional(),
  })
  .strict();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const ipHits: Map<string, number[]> = new Map();

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function rateLimitCheck(ip: string): { ok: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const hits = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= RATE_LIMIT_MAX) {
    const oldest = hits[0]!;
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000),
    };
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return { ok: true };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "invalid_input",
        field: issue?.path?.[0] ?? null,
        message: issue?.message ?? "Invalid input.",
      },
      { status: 400 },
    );
  }

  // Honeypot — silent success so a bot doesn't probe.
  if (parsed.data.website && parsed.data.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const rl = rateLimitCheck(clientIp(req));
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many submissions. Please try again later.",
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  const reporterEmail = parsed.data.reporter_email || null;

  try {
    await createSafeguardingReport({
      source: "public_form",
      report_type: parsed.data.report_type,
      description: parsed.data.description,
      reporter_name: parsed.data.reporter_name || null,
      reporter_email: reporterEmail,
      reporter_relationship: parsed.data.reporter_relationship || null,
      child_reference: parsed.data.child_reference || null,
    });

    // Best-effort emails. The row already landed; a Resend hiccup must
    // not unwind the request. The ADMIN alert carries NO case details —
    // type + "review in the queue" only. The reporter ack (optional) is
    // minimal and non-committal.
    const tasks = [
      sendEmail({
        to: SAFEGUARDING_ALERT_EMAIL,
        subject: "New safeguarding report received",
        template: OperationalNoticeEmail({
          heading: "New safeguarding report",
          eyebrow: "Safeguarding",
          intro:
            "A new safeguarding report was submitted via the public form and is waiting in the safeguarding queue. Open it there to triage — details are intentionally NOT included in this email.",
          sections: [
            { label: "Type", body: REPORT_TYPE_LABELS[parsed.data.report_type] },
            { label: "Source", body: "Public form" },
            {
              label: "Review",
              body: "Safeguarding lead → /admin/safeguarding-reports (set risk level + status).",
            },
          ],
        }),
      }),
    ];
    if (reporterEmail) {
      tasks.push(
        sendEmail({
          to: reporterEmail,
          subject: "Your safeguarding report has been received",
          template: SafeguardingReportAckEmail({
            reporterName: parsed.data.reporter_name || null,
          }),
        }),
      );
    }
    await Promise.allSettled(tasks).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never echo report content. Log only the error type.
    console.error(
      "[/api/safeguarding-report] create failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
