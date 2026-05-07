import type { ReactElement } from "react";
import { Resend } from "resend";
import { render } from "@react-email/render";

let cachedResend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedResend) cachedResend = new Resend(key);
  return cachedResend;
}

export type SendResult =
  | { success: true; messageId: string; html: string; text: string }
  | { success: false; error: string };

export async function sendEmail({
  to,
  subject,
  template,
  preview: _preview,
  replyTo,
}: {
  to: string;
  subject: string;
  template: ReactElement;
  preview?: string;
  replyTo?: string;
}): Promise<SendResult> {
  const html = await render(template);
  const text = await render(template, { plainText: true });

  const client = getResend();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set, skipping send", {
      to,
      subject,
    });
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const from =
    process.env.RESEND_FROM_EMAIL ?? "OrphanGive <hello@orphangive.org>";

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return { success: false, error: error.message };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no message id" };
    }
    return { success: true, messageId: data.id, html, text };
  } catch (err) {
    console.error("[email] send threw:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

// Render a template to HTML/text without sending. Used by the preview
// route to surface the rendered email in the browser.
export async function renderTemplate(
  template: ReactElement,
): Promise<{ html: string; text: string }> {
  const html = await render(template);
  const text = await render(template, { plainText: true });
  return { html, text };
}

// ─── Internal API auth ──────────────────────────────────────────────────────
// Verifies the Authorization: Bearer header against INTERNAL_API_TOKEN.
// Constant-time comparison to defeat timing oracles. Returns null when
// authorized; otherwise a 401 Response the caller can return directly.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function verifyInternalAuth(req: Request): NextResponse | null {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "INTERNAL_API_TOKEN not configured" },
      { status: 500 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const provided = match[1]!;
  // timingSafeEqual requires equal-length buffers — pad/truncate via SHA-256
  // would also work but a length check then equal-length compare is enough.
  if (provided.length !== expected.length) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

// Site URL helper used to build absolute CTA links in emails.
export function siteUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://orphangive.org";
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
