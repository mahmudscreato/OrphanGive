// Server-only data fetchers + helpers for email routes. None of these
// touch the donor's session — they're called by Directus Flows or by
// the webhook with bearer-token auth.

import { readItem, readItems, readUser } from "@directus/sdk";
import { directusServer } from "./directus";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ─── Donor (admin-side fetch by id) ─────────────────────────────────────────
export type EmailDonor = {
  id: string;
  email: string;
  first_name: string | null;
  og_admin_approval_status: string;
};

export async function fetchDonorById(id: string): Promise<EmailDonor | null> {
  if (!isUuid(id)) return null;
  try {
    const row = (await directusServer().request(
      readUser(id as never, {
        fields: [
          "id",
          "email",
          "first_name",
          "og_admin_approval_status",
        ],
      } as never),
    )) as unknown as Record<string, unknown> | null;
    if (!row || typeof row !== "object" || !row.id) return null;
    return {
      id: String(row.id),
      email: String(row.email ?? ""),
      first_name: (row.first_name as string | null) ?? null,
      og_admin_approval_status: String(row.og_admin_approval_status ?? ""),
    };
  } catch (err) {
    console.warn(
      "[email-data] fetchDonorById failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Child (lookup by id) ───────────────────────────────────────────────────
export type EmailChild = {
  id: string;
  display_name: string | null;
  district: string | null;
  age: number | null;
  pronoun: "he" | "she" | "they";
};

function pronounFromGender(g: unknown): "he" | "she" | "they" {
  const s = typeof g === "string" ? g.toLowerCase() : "";
  if (s.startsWith("m")) return "he"; // male / man / boy
  if (s.startsWith("f") || s === "girl") return "she";
  return "they";
}

function ageFromDob(dob: unknown): number | null {
  if (typeof dob !== "string") return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export async function fetchChildById(id: string): Promise<EmailChild | null> {
  if (!isUuid(id)) return null;
  try {
    const row = (await directusServer().request(
      readItem("child" as never, id as never, {
        fields: [
          "id",
          "display_name",
          "date_of_birth",
          "gender",
          "bd_district.name",
        ],
      } as never),
    )) as unknown as Record<string, unknown> | null;
    if (!row || !row.id) return null;
    const district =
      (row.bd_district as { name?: string | null } | null)?.name ?? null;
    return {
      id: String(row.id),
      display_name: (row.display_name as string | null) ?? null,
      district: district ? String(district) : null,
      age: ageFromDob(row.date_of_birth),
      pronoun: pronounFromGender(row.gender),
    };
  } catch (err) {
    console.warn(
      "[email-data] fetchChildById failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function fetchChildrenByIds(
  ids: ReadonlyArray<string>,
): Promise<Map<string, EmailChild>> {
  const valid = ids.filter(isUuid);
  const out = new Map<string, EmailChild>();
  if (valid.length === 0) return out;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _in: valid } },
        fields: [
          "id",
          "display_name",
          "date_of_birth",
          "gender",
          "bd_district.name",
        ],
        limit: -1,
      } as never),
    )) as unknown as Array<Record<string, unknown>>;
    for (const row of rows ?? []) {
      if (!row.id) continue;
      const district =
        (row.bd_district as { name?: string | null } | null)?.name ?? null;
      out.set(String(row.id), {
        id: String(row.id),
        display_name: (row.display_name as string | null) ?? null,
        district: district ? String(district) : null,
        age: ageFromDob(row.date_of_birth),
        pronoun: pronounFromGender(row.gender),
      });
    }
  } catch (err) {
    console.warn(
      "[email-data] fetchChildrenByIds failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

// ─── Sponsorship (full row by id, donor + child as ids only) ────────────────
export type EmailSponsorship = {
  id: string;
  donor: string;
  child: string;
  payment_mode: "monthly" | "one_time";
  amount_usd: number;
  next_billing_date: string | null;
  status: string;
};

export async function fetchSponsorshipsByIds(
  ids: ReadonlyArray<string>,
): Promise<EmailSponsorship[]> {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: { id: { _in: valid } },
        fields: [
          "id",
          "donor",
          "child",
          "payment_mode",
          "amount_usd",
          "next_billing_date",
          "status",
        ],
        limit: -1,
      } as never),
    )) as unknown as Array<Record<string, unknown>>;
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      donor: String(r.donor),
      child: String(r.child),
      payment_mode:
        r.payment_mode === "monthly" || r.payment_mode === "one_time"
          ? r.payment_mode
          : "monthly",
      amount_usd: Number(r.amount_usd ?? 0),
      next_billing_date: (r.next_billing_date as string | null) ?? null,
      status: String(r.status ?? ""),
    }));
  } catch (err) {
    console.warn(
      "[email-data] fetchSponsorshipsByIds failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─── Reveal request ─────────────────────────────────────────────────────────
export type EmailRevealRequest = {
  id: string;
  donor: string;
  child: string;
  field_name: string;
  status: string;
  admin_decision_note: string | null;
};

export async function fetchRevealRequestById(
  id: string,
): Promise<EmailRevealRequest | null> {
  if (!isUuid(id)) return null;
  try {
    const row = (await directusServer().request(
      readItem("reveal_request" as never, id as never, {
        fields: [
          "id",
          "donor",
          "child",
          "field_name",
          "status",
          "admin_decision_note",
        ],
      } as never),
    )) as unknown as Record<string, unknown> | null;
    if (!row || !row.id) return null;
    return {
      id: String(row.id),
      donor: String(row.donor),
      child: String(row.child),
      field_name: String(row.field_name),
      status: String(row.status),
      admin_decision_note:
        (row.admin_decision_note as string | null) ?? null,
    };
  } catch (err) {
    console.warn(
      "[email-data] fetchRevealRequestById failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Payment ────────────────────────────────────────────────────────────────
export type EmailPayment = {
  id: string;
  sponsorship: string;
  amount_usd: number;
  paid_at: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  payment_method_type: string | null;
};

export async function fetchPaymentById(
  id: string,
): Promise<EmailPayment | null> {
  if (!isUuid(id)) return null;
  try {
    const row = (await directusServer().request(
      readItem("payment" as never, id as never, {
        fields: [
          "id",
          "sponsorship",
          "amount_usd",
          "paid_at",
          "stripe_payment_intent_id",
          "stripe_charge_id",
          "payment_method_type",
        ],
      } as never),
    )) as unknown as Record<string, unknown> | null;
    if (!row || !row.id) return null;
    return {
      id: String(row.id),
      sponsorship: String(row.sponsorship),
      amount_usd: Number(row.amount_usd ?? 0),
      paid_at: String(row.paid_at ?? new Date().toISOString()),
      stripe_payment_intent_id:
        (row.stripe_payment_intent_id as string | null) ?? null,
      stripe_charge_id: (row.stripe_charge_id as string | null) ?? null,
      payment_method_type:
        (row.payment_method_type as string | null) ?? null,
    };
  } catch (err) {
    console.warn(
      "[email-data] fetchPaymentById failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// Format an email To header as "Name <addr>" when a name is available.
export function formatTo(email: string, firstName: string | null): string {
  if (!firstName) return email;
  // Strip characters that would break RFC 5322 display-name parsing.
  const safe = firstName.replace(/[<>",@]/g, "").trim();
  if (!safe) return email;
  return `${safe} <${email}>`;
}
