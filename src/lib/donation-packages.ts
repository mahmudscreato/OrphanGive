// Session 58 — typed reads from the donation_package collection.
//
// donation_package is admin-editable (via /admin/donation-packages)
// and drives the package presets shown on /sponsor/[childId] and
// /donate. We never write from public-side code paths.
//
// Public reads filter is_active=true; admin reads bypass it so
// disabled packages remain editable.

import "server-only";
import { readItem, readItems } from "@directus/sdk";
import { directusServer } from "./directus";

export type PackageType = "monthly" | "one_time";

export interface DonationPackage {
  id: string;
  package_type: PackageType;
  display_order: number;
  is_active: boolean;
  name_en: string;
  name_bn: string | null;
  description_en: string;
  description_bn: string | null;
  /** Whole BDT (no paisa). Donor-facing amount = round(amount_bdt / rate.bdt_per_unit). */
  amount_bdt: number;
  /** Subset of child.support_type enum values. Empty for non-child-scoped one-time gifts. */
  support_types: string[];
  /** One-time campaign tag (e.g. "feed-a-child"). Null on monthly. */
  cause_tag: string | null;
  /** Lucide icon name (e.g. "BookOpen"). Optional. */
  icon: string | null;
  date_created: string | null;
  date_updated: string | null;
}

const FIELDS = [
  "id",
  "package_type",
  "display_order",
  "is_active",
  "name_en",
  "name_bn",
  "description_en",
  "description_bn",
  "amount_bdt",
  "support_types",
  "cause_tag",
  "icon",
  "date_created",
  "date_updated",
] as const;

/**
 * Directus row shape — narrow before exposing.
 * Mostly mirrors DonationPackage but Directus returns nullable strings
 * for optional fields and the JSON column is unknown until parsed.
 */
interface RawRow {
  id: string;
  package_type: string;
  display_order: number | null;
  is_active: boolean | null;
  name_en: string;
  name_bn: string | null;
  description_en: string;
  description_bn: string | null;
  amount_bdt: number | string;
  support_types: unknown;
  cause_tag: string | null;
  icon: string | null;
  date_created: string | null;
  date_updated: string | null;
}

function coerceAmount(v: number | string): number {
  if (typeof v === "number") return v;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function coerceSupportTypes(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  // Directus has been seen to return a stringified JSON array on some
  // configurations; tolerate it.
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through */
    }
  }
  return [];
}

function narrow(row: RawRow): DonationPackage {
  const type = row.package_type === "one_time" ? "one_time" : "monthly";
  return {
    id: row.id,
    package_type: type,
    display_order: row.display_order ?? 0,
    is_active: row.is_active ?? false,
    name_en: row.name_en,
    name_bn: row.name_bn,
    description_en: row.description_en,
    description_bn: row.description_bn,
    amount_bdt: coerceAmount(row.amount_bdt),
    support_types: coerceSupportTypes(row.support_types),
    cause_tag: row.cause_tag,
    icon: row.icon,
    date_created: row.date_created,
    date_updated: row.date_updated,
  };
}

/**
 * Active packages of a given type, sorted by display_order ASC.
 * Public-facing — never returns is_active=false rows.
 */
export async function listActivePackages(
  type: PackageType,
): Promise<DonationPackage[]> {
  const rows = (await directusServer().request(
    readItems("donation_package" as never, {
      filter: {
        package_type: { _eq: type },
        is_active: { _eq: true },
      },
      sort: ["display_order"],
      fields: FIELDS as unknown as string[],
      limit: 100,
    } as never),
  )) as unknown as RawRow[];
  return rows.map(narrow);
}

/**
 * Every package (active or not), sorted package_type then display_order.
 * Admin-only — exposes inactive rows.
 */
export async function listAllPackagesForAdmin(): Promise<DonationPackage[]> {
  const rows = (await directusServer().request(
    readItems("donation_package" as never, {
      sort: ["package_type", "display_order"],
      fields: FIELDS as unknown as string[],
      limit: 200,
    } as never),
  )) as unknown as RawRow[];
  return rows.map(narrow);
}

/**
 * Single package by id. Returns null if not found OR (for public
 * callers) if inactive. Pass `{ includeInactive: true }` from admin
 * code paths.
 */
export async function getPackageById(
  id: string,
  opts: { includeInactive?: boolean } = {},
): Promise<DonationPackage | null> {
  try {
    const row = (await directusServer().request(
      readItem("donation_package" as never, id, {
        fields: FIELDS as unknown as string[],
      } as never),
    )) as unknown as RawRow | null;
    if (!row) return null;
    const pkg = narrow(row);
    if (!opts.includeInactive && !pkg.is_active) return null;
    return pkg;
  } catch {
    return null;
  }
}

/**
 * Smallest active monthly amount, used as the minimum on the
 * /sponsor/[childId] custom-amount input.
 *
 * Returns 0 if no active monthly packages exist (caller should
 * gracefully fall back to a hardcoded floor).
 */
export async function getMinimumActiveMonthlyAmountBdt(): Promise<number> {
  const monthly = await listActivePackages("monthly");
  if (monthly.length === 0) return 0;
  return Math.min(...monthly.map((p) => p.amount_bdt));
}
