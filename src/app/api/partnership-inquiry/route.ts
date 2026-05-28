// P4 — POST /api/partnership-inquiry
//
// Public form endpoint for /for-charities. Adult partner-org
// contact info — standard PII handling, no third-party captcha
// (privacy). Spam control via:
//   1. Honeypot field — a hidden form input named `website`. Real
//      users can't see it; bots auto-fill it.
//   2. Per-IP rate limit — module-scoped sliding window. 5 successful
//      writes per IP per hour. Sufficient for a single-replica deploy
//      (which prod is); if we ever scale horizontally, swap for Redis.
//
// Validation is server-authoritative. Zod-validated payload; the
// client form runs the same shape for instant feedback but the
// server reruns to enforce.
//
// Privacy: the message body is stored in Directus only. NEVER logged
// to stdout / Sentry. The audit log is a future enhancement (skipped
// for v1 to minimise where partner contact info lands).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createPartnershipInquiry,
  INQUIRY_TYPES,
} from "@/lib/partnership-inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Zod schema ────────────────────────────────────────────────────

const submitSchema = z
  .object({
    organisation_name: z.string().trim().min(1).max(200),
    contact_name: z.string().trim().min(1).max(100),
    role: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .min(1)
      .max(254)
      .email("Invalid email."),
    // Phone is optional; if present, basic shape (digits, spaces,
    // +, -, parens). No country-format enforcement — partners may
    // be in any country.
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^[\d\s+\-()]*$/, "Invalid phone format.")
      .optional()
      .or(z.literal("")),
    inquiry_type: z.enum(INQUIRY_TYPES),
    message: z.string().trim().min(20, "Tell us a little more (20+ characters).").max(2000),
    // Honeypot — schema accepts any string up to 200 chars so a bot
    // gets a 200 response, but the handler below silently 200s without
    // persisting when the field is non-empty. Doing the check in the
    // handler (not the schema) avoids tipping off the bot with a 400.
    website: z.string().max(200).optional(),
    source: z.string().trim().max(64).optional(),
  })
  .strict();

// ─── In-memory per-IP rate limit ───────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5; // 5 successful submits / IP / hour
const ipHits: Map<string, number[]> = new Map();

function clientIp(req: NextRequest): string {
  // Behind Vercel / nginx the canonical headers are x-forwarded-for
  // (comma-separated, leftmost = client). Fall back to a sentinel
  // so the limit still kicks in even when the header is missing.
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

// ─── Handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Parse body. Reject non-JSON / oversized payloads as 400.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    // Surface the first field error so the client can highlight it.
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

  // Honeypot — schema enforces empty, but double-check defensively.
  if (parsed.data.website && parsed.data.website.length > 0) {
    // Silent success — pretend acceptance so the bot doesn't probe further.
    return NextResponse.json({ ok: true });
  }

  // Per-IP rate limit.
  const ip = clientIp(req);
  const rl = rateLimitCheck(ip);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many submissions. Try again later.",
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  try {
    const { id } = await createPartnershipInquiry({
      organisation_name: parsed.data.organisation_name,
      contact_name: parsed.data.contact_name,
      role: parsed.data.role,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      inquiry_type: parsed.data.inquiry_type,
      message: parsed.data.message,
      source: parsed.data.source ?? "for-charities",
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    // Do NOT echo the message body or any field value. Log only the
    // error type, not the user's content.
    console.error(
      "[/api/partnership-inquiry] create failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
