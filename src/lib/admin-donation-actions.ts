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
  /**
   * Session 58.3 — refines the multi-step /sponsor flow's section
   * grouping. Optional on create; defaults to monthly_tier (monthly)
   * or one_time_quick (one_time) inside validate when omitted.
   */
  package_subtype: "monthly_tier" | "one_time_quick" | "one_time_gift" | null;
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
  // Subtype must match package_type. monthly_tier ↔ monthly;
  // one_time_quick + one_time_gift ↔ one_time. Null is allowed
  // (legacy / unmigrated) but the data layer will default it.
  if (input.package_subtype !== null) {
    if (
      input.package_type === "monthly" &&
      input.package_subtype !== "monthly_tier"
    ) {
      return "monthly packages must use subtype 'monthly_tier'";
    }
    if (
      input.package_type === "one_time" &&
      input.package_subtype !== "one_time_quick" &&
      input.package_subtype !== "one_time_gift"
    ) {
      return "one-time packages must use subtype 'one_time_quick' or 'one_time_gift'";
    }
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

  // Default subtype when omitted so admin creates from minimal forms
  // still produce well-categorized rows.
  const subtype: PackageInput["package_subtype"] =
    opts.input.package_subtype ??
    (opts.input.package_type === "monthly"
      ? "monthly_tier"
      : opts.input.cause_tag
        ? "one_time_gift"
        : "one_time_quick");

  const created = (await directusServer().request(
    createItem("donation_package" as never, {
      ...opts.input,
      // Directus expects nulls explicitly for nullable columns.
      name_bn: opts.input.name_bn ?? null,
      description_bn: opts.input.description_bn ?? null,
      cause_tag: opts.input.cause_tag ?? null,
      icon: opts.input.icon ?? null,
      duration_months: opts.input.duration_months ?? null,
      package_subtype: subtype,
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

/**
 * Bulk display_order update from the drag-and-drop reorder UI.
 *
 * Takes [{id, display_order}, ...]. Issues one updateItem per row
 * (Directus doesn't have a "bulk patch by id with per-row payload"
 * endpoint), then writes a single audit event with the affected
 * ids + new orders in metadata. Any individual write failure
 * throws; the route handler maps that to a 500 and the client
 * shows an error + refetches the canonical order from the server.
 *
 * Section integrity: callers must validate that all ids in a single
 * call belong to the same package_type (monthly XOR one_time), since
 * the UI sorts those sections independently. We don't re-check
 * here — the API route does that gate.
 */
export async function reorderDonationPackages(opts: {
  actorUserId: string;
  items: ReadonlyArray<{ id: string; display_order: number }>;
  request?: Request;
}): Promise<void> {
  if (opts.items.length === 0) return;
  const ds = directusServer();
  for (const item of opts.items) {
    if (!Number.isInteger(item.display_order)) {
      throw new Error(
        `display_order must be an integer (got ${item.display_order})`,
      );
    }
    await ds.request(
      updateItem(
        "donation_package" as never,
        item.id,
        { display_order: item.display_order } as never,
      ),
    );
  }
  await recordAuditEvent({
    actorUserId: opts.actorUserId,
    actorRole: "admin",
    action: "admin_reordered_donation_packages",
    collection: "donation_package",
    metadata: {
      count: opts.items.length,
      orders: opts.items.map((i) => ({
        id: i.id,
        display_order: i.display_order,
      })),
    },
    request: opts.request,
  });
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
    package_subtype: before.package_subtype,
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
