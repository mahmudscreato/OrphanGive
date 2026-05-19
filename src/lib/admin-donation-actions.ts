// Session 58.2 — admin CRUD actions for donation_package + currency_rate.
//
// Each mutating helper:
//   1. Reads the current row (for the audit diff snapshot)
//   2. Applies the patch / insert / archive flag flip
//   3. Records an audit event with the per-field diff
//
// Audit per the existing di-audit pattern. Best-effort errors —
// if Directus rejects the write, the helper throws and the API
// route translates to an HTTP error.

import "server-only";
import { createItem, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";
import { recordAuditEvent } from "./di-audit";
import {
  type DonationPackage,
  getPackageById,
} from "./donation-packages";
import { type CurrencyRate, getCurrencyById } from "./currency-rates";

// ─── donation_package ──────────────────────────────────────────────

export interface PackageInput {
  package_type: "monthly" | "one_time";
  display_order: number;
  is_active: boolean;
  name_en: string;
  name_bn: string | null;
  description_en: string;
  description_bn: string | null;
  amount_bdt: number;
  support_types: string[];
  cause_tag: string | null;
  icon: string | null;
  duration_months: number | null;
}

function validatePackage(input: PackageInput): string | null {
  if (!input.name_en.trim()) return "name_en required";
  if (!input.description_en.trim()) return "description_en required";
  if (!Number.isInteger(input.amount_bdt) || input.amount_bdt < 1)
    return "amount_bdt must be a positive integer";
  if (
    input.package_type === "monthly" &&
    input.duration_months !== null &&
    (!Number.isInteger(input.duration_months) || input.duration_months < 1)
  ) {
    return "duration_months must be null or a positive integer";
  }
  if (input.package_type === "one_time" && input.duration_months !== null) {
    return "duration_months only applies to monthly packages";
  }
  return null;
}

export async function createDonationPackage(opts: {
  actorUserId: string;
  input: PackageInput;
  request?: Request;
}): Promise<{ id: string }> {
  const v = validatePackage(opts.input);
  if (v) throw new Error(v);

  const created = (await directusServer().request(
    createItem("donation_package" as never, {
      ...opts.input,
      // Directus expects nulls explicitly for nullable columns.
      name_bn: opts.input.name_bn ?? null,
      description_bn: opts.input.description_bn ?? null,
      cause_tag: opts.input.cause_tag ?? null,
      icon: opts.input.icon ?? null,
      duration_months: opts.input.duration_months ?? null,
    } as never),
  )) as unknown as { id: string };

  await recordAuditEvent({
    actorUserId: opts.actorUserId,
    actorRole: "admin",
    action: "admin_created_donation_package",
    collection: "donation_package",
    recordId: created.id,
    metadata: {
      name_en: opts.input.name_en,
      package_type: opts.input.package_type,
      amount_bdt: opts.input.amount_bdt,
    },
    request: opts.request,
  });

  return { id: created.id };
}

function diffPackage(
  before: DonationPackage,
  patch: Partial<PackageInput>,
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of Object.keys(patch) as Array<keyof PackageInput>) {
    const beforeVal = (before as unknown as Record<string, unknown>)[k];
    const afterVal = patch[k];
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      diff[k] = { old: beforeVal, new: afterVal };
    }
  }
  return diff;
}

export async function updateDonationPackage(opts: {
  actorUserId: string;
  id: string;
  patch: Partial<PackageInput>;
  request?: Request;
}): Promise<void> {
  const before = await getPackageById(opts.id, { includeInactive: true });
  if (!before) throw new Error("Package not found");

  // Re-validate the FULL row after the patch.
  const merged: PackageInput = {
    package_type: before.package_type,
    display_order: before.display_order,
    is_active: before.is_active,
    name_en: before.name_en,
    name_bn: before.name_bn,
    description_en: before.description_en,
    description_bn: before.description_bn,
    amount_bdt: before.amount_bdt,
    support_types: before.support_types,
    cause_tag: before.cause_tag,
    icon: before.icon,
    duration_months: before.duration_months,
    ...opts.patch,
  };
  const v = validatePackage(merged);
  if (v) throw new Error(v);

  await directusServer().request(
    updateItem("donation_package" as never, opts.id, opts.patch as never),
  );

  const diff = diffPackage(before, opts.patch);

  // If is_active flipped, audit specifically as archive / reactivate.
  let action:
    | "admin_edited_donation_package"
    | "admin_archived_donation_package"
    | "admin_reactivated_donation_package" = "admin_edited_donation_package";
  if (
    Object.prototype.hasOwnProperty.call(opts.patch, "is_active") &&
    opts.patch.is_active !== before.is_active
  ) {
    action =
      opts.patch.is_active === false
        ? "admin_archived_donation_package"
        : "admin_reactivated_donation_package";
  }

  await recordAuditEvent({
    actorUserId: opts.actorUserId,
    actorRole: "admin",
    action,
    collection: "donation_package",
    recordId: opts.id,
    diff,
    metadata: { name_en: merged.name_en },
    request: opts.request,
  });
}

// ─── currency_rate ─────────────────────────────────────────────────

export interface CurrencyRateInput {
  bdt_per_unit: number;
  is_active: boolean;
  display_name: string;
  symbol: string;
}

function validateRate(input: Partial<CurrencyRateInput>): string | null {
  if (
    input.bdt_per_unit !== undefined &&
    (!Number.isFinite(input.bdt_per_unit) || input.bdt_per_unit <= 0)
  )
    return "bdt_per_unit must be a positive number";
  if (input.display_name !== undefined && !input.display_name.trim())
    return "display_name required";
  if (input.symbol !== undefined && !input.symbol.trim())
    return "symbol required";
  return null;
}

export async function updateCurrencyRate(opts: {
  actorUserId: string;
  id: string;
  patch: Partial<CurrencyRateInput>;
  request?: Request;
}): Promise<void> {
  const v = validateRate(opts.patch);
  if (v) throw new Error(v);

  const before = await getCurrencyById(opts.id);
  if (!before) throw new Error("Currency rate not found");

  await directusServer().request(
    updateItem("currency_rate" as never, opts.id, opts.patch as never),
  );

  const diff: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of Object.keys(opts.patch) as Array<keyof CurrencyRateInput>) {
    const beforeVal = (before as unknown as Record<string, unknown>)[k];
    const afterVal = opts.patch[k];
    if (beforeVal !== afterVal) diff[k] = { old: beforeVal, new: afterVal };
  }

  await recordAuditEvent({
    actorUserId: opts.actorUserId,
    actorRole: "admin",
    action: "admin_edited_currency_rate",
    collection: "currency_rate",
    recordId: opts.id,
    diff,
    metadata: { currency_code: before.currency_code },
    request: opts.request,
  });
}
