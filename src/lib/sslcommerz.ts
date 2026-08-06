// feat/sslcommerz-phase1-guest — SSLCommerz gateway helper (hosted redirect +
// IPN validation). Phase 1 scope: guest one-time cause donations only, BDT only.
//
// SECURITY MODEL (mirrors the plan):
//   - The browser redirect back to success_url is NOT proof of payment.
//   - Settlement is confirmed ONLY server-to-server: the IPN handler verifies
//     the `verify_sign` hash AND calls the Validation API with `val_id`, then
//     matches the validated amount + currency against our pending row.
//
// Docs: https://developer.sslcommerz.com/doc/v4/  ·  https://developer.sslcommerz.com/docs.html

import "server-only";

import { createHash } from "node:crypto";

// ─── Config (env, never hardcoded) ──────────────────────────────────────
// SANDBOX by default; set SSLCOMMERZ_SANDBOX="false" for live.

export interface SslcommerzConfig {
  storeId: string;
  storePasswd: string;
  sandbox: boolean;
}

export function getSslcommerzConfig(): SslcommerzConfig {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePasswd = process.env.SSLCOMMERZ_STORE_PASSWD;
  if (!storeId || !storePasswd) {
    throw new Error(
      "SSLCommerz not configured: set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWD.",
    );
  }
  // Default to SANDBOX unless explicitly disabled — safe by default.
  const sandbox = (process.env.SSLCOMMERZ_SANDBOX ?? "true") !== "false";
  return { storeId, storePasswd, sandbox };
}

export function isSslcommerzConfigured(): boolean {
  return Boolean(
    process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWD,
  );
}

function hosts(sandbox: boolean) {
  return sandbox
    ? {
        init: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
        validate:
          "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php",
      }
    : {
        init: "https://securepay.sslcommerz.com/gwprocess/v4/api.php",
        validate:
          "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php",
      };
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

// ─── Session init ───────────────────────────────────────────────────────
// Returns the GatewayPageURL to redirect the donor to, or an error.

export interface SessionInput {
  tranId: string; // OUR unique id (also the IPN lookup key)
  amountBdt: number; // whole taka; sent as decimal(10,2)
  productName: string;
  productCategory: string;
  cusName: string;
  cusEmail: string;
  cusPhone?: string | null;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
}

export interface SessionResult {
  ok: boolean;
  gatewayPageURL?: string;
  sessionkey?: string;
  error?: string;
}

export async function createSslcommerzSession(
  input: SessionInput,
): Promise<SessionResult> {
  const cfg = getSslcommerzConfig();
  const { init } = hosts(cfg.sandbox);

  // total_amount must be decimal(10,2) within 10.00–500000.00 BDT.
  const form = new URLSearchParams();
  form.set("store_id", cfg.storeId);
  form.set("store_passwd", cfg.storePasswd);
  form.set("total_amount", input.amountBdt.toFixed(2));
  form.set("currency", "BDT");
  form.set("tran_id", input.tranId);
  form.set("success_url", input.successUrl);
  form.set("fail_url", input.failUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("ipn_url", input.ipnUrl);
  // Customer (required by SSLCommerz). Donations are non-physical → no shipping.
  form.set("cus_name", input.cusName);
  form.set("cus_email", input.cusEmail);
  form.set("cus_add1", "N/A");
  form.set("cus_city", "Dhaka");
  form.set("cus_country", "Bangladesh");
  form.set("cus_phone", input.cusPhone?.trim() || "N/A");
  form.set("shipping_method", "NO");
  form.set("num_of_item", "1");
  form.set("product_name", input.productName);
  form.set("product_category", input.productCategory);
  form.set("product_profile", "non-physical-goods");

  let res: Response;
  try {
    res = await fetch(init, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SSLCommerz network error",
    };
  }

  let data: {
    status?: string;
    GatewayPageURL?: string;
    sessionkey?: string;
    failedreason?: string;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, error: "SSLCommerz returned a non-JSON response." };
  }

  if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
    return {
      ok: false,
      error: data.failedreason || "SSLCommerz session init failed.",
    };
  }
  return {
    ok: true,
    gatewayPageURL: data.GatewayPageURL,
    sessionkey: data.sessionkey,
  };
}

// ─── Validation API (server-to-server settlement proof) ──────────────────

export interface ValidationResult {
  ok: boolean; // true only when status is VALID or VALIDATED
  status?: string; // VALID | VALIDATED | INVALID_TRANSACTION | ...
  tranId?: string;
  valId?: string;
  amount?: number; // parsed from the validated `amount`
  currency?: string;
  bankTranId?: string;
  cardType?: string;
  email?: string | null;
  error?: string;
  raw?: Record<string, unknown>;
}

export async function validateSslcommerzTransaction(
  valId: string,
): Promise<ValidationResult> {
  const cfg = getSslcommerzConfig();
  const { validate } = hosts(cfg.sandbox);
  const url = new URL(validate);
  url.searchParams.set("val_id", valId);
  url.searchParams.set("store_id", cfg.storeId);
  url.searchParams.set("store_passwd", cfg.storePasswd);
  url.searchParams.set("format", "json");

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: "GET" });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SSLCommerz network error",
    };
  }

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Validation API returned non-JSON." };
  }

  const status = typeof data.status === "string" ? data.status : undefined;
  const amountRaw = data.amount;
  const amount =
    typeof amountRaw === "string"
      ? Number(amountRaw)
      : typeof amountRaw === "number"
        ? amountRaw
        : undefined;

  return {
    ok: status === "VALID" || status === "VALIDATED",
    status,
    tranId: typeof data.tran_id === "string" ? data.tran_id : undefined,
    valId: typeof data.val_id === "string" ? data.val_id : undefined,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency: typeof data.currency === "string" ? data.currency : undefined,
    bankTranId:
      typeof data.bank_tran_id === "string" ? data.bank_tran_id : undefined,
    cardType: typeof data.card_type === "string" ? data.card_type : undefined,
    email: typeof data.cus_email === "string" ? data.cus_email : null,
    raw: data,
  };
}

// ─── IPN hash verification (verify_sign) ─────────────────────────────────
// SSLCommerz's documented method: take the fields named in `verify_key`,
// add store_passwd = MD5(store password), sort keys alphabetically, join
// key=value with '&', MD5 the string, compare to `verify_sign`.
//
// This proves the POST body came from SSLCommerz (unforgeable without the
// store password). It is the FIRST gate — the Validation API call is the
// second, independent gate.

export function verifySslcommerzIpnHash(
  fields: Record<string, string>,
): boolean {
  const cfg = getSslcommerzConfig();
  const verifySign = fields.verify_sign;
  const verifyKey = fields.verify_key;
  if (!verifySign || !verifyKey) return false;

  const keys = verifyKey.split(",").map((k) => k.trim()).filter(Boolean);
  const data: Record<string, string> = {};
  for (const k of keys) {
    // Use empty string for a listed-but-absent key (matches SSLCommerz).
    data[k] = fields[k] ?? "";
  }
  data.store_passwd = md5(cfg.storePasswd);

  const hashString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("&");

  return md5(hashString) === verifySign;
}
