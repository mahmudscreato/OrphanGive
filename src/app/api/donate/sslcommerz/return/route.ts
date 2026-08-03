// feat/sslcommerz-phase1-guest — SSLCommerz browser return handler.
//
// success_url / fail_url / cancel_url all point here (with ?state=...).
// SSLCommerz redirects the BROWSER back via POST. This is NOT proof of payment —
// it does NOT touch the donation record. It only bounces the donor to a
// human-friendly status page. Settlement happens solely in the IPN handler.

import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/email";

export const runtime = "nodejs";

function stateFrom(v: string | null): "success" | "fail" | "cancel" {
  return v === "success" || v === "fail" || v === "cancel" ? v : "fail";
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const state = stateFrom(url.searchParams.get("state"));

  // tran_id may arrive as a POST field (SSLCommerz) or a query param.
  let tranId = url.searchParams.get("tran_id") ?? "";
  if (!tranId && req.method === "POST") {
    try {
      const form = await req.formData();
      const t = form.get("tran_id");
      if (typeof t === "string") tranId = t;
    } catch {
      /* ignore — the status page works without it */
    }
  }

  const dest = new URL(siteUrl("/donate/sslcommerz/status"));
  dest.searchParams.set("state", state);
  if (tranId) dest.searchParams.set("ref", tranId);
  // 303 so the browser issues a GET to the status page after the POST.
  return NextResponse.redirect(dest.toString(), 303);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
