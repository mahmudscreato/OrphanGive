// Session 58 — typed reads from currency_rate + conversion helpers.
//
// currency_rate.bdt_per_unit comes back from Directus as a STRING
// because Postgres NUMERIC marshals through pg's wire protocol as
// text. The narrow() helper coerces at the boundary so consumers
// only ever see numbers.
//
// All conversions use whole-unit math: donor-currency amounts are
// rounded to whole units (we don't show fractional cents in the
// preset cards), and BDT-equivalent reverses to whole BDT. Stripe
// itself handles smallest-unit conversion in stripe-currency.ts.

import "server-only";
import { readItems, readItem } from "@directus/sdk";
import { directusServer } from "./directus";

export interface CurrencyRate {
  id: string;
  /** ISO 4217. Uppercase. */
  currency_code: string;
  display_name: string;
  symbol: string;
  /** How many BDT = 1 unit of this currency. BDT itself = 1.0. */
  bdt_per_unit: number;
  is_active: boolean;
  date_updated: string | null;
}

const FIELDS = [
  "id",
  "currency_code",
  "display_name",
  "symbol",
  "bdt_per_unit",
  "is_active",
  "date_updated",
] as const;

interface RawRow {
  id: string;
  currency_code: string;
  display_name: string;
  symbol: string;
  bdt_per_unit: number | string;
  is_active: boolean | null;
  date_updated: string | null;
}

function coerceRate(v: number | string): number {
  if (typeof v === "number") return v;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function narrow(row: RawRow): CurrencyRate {
  return {
    id: row.id,
    currency_code: row.currency_code.toUpperCase(),
    display_name: row.display_name,
    symbol: row.symbol,
    bdt_per_unit: coerceRate(row.bdt_per_unit),
    is_active: row.is_active ?? false,
    date_updated: row.date_updated,
  };
}

// ---------- reads ----------

/**
 * All active currencies, sorted: BDT first, then alphabetical.
 * BDT-first is intentional — when shown in a picker, it should
 * top the list for Bangladeshi donors.
 */
export async function listActiveCurrencies(): Promise<CurrencyRate[]> {
  const rows = (await directusServer().request(
    readItems("currency_rate" as never, {
      filter: { is_active: { _eq: true } },
      sort: ["currency_code"],
      fields: FIELDS as unknown as string[],
      limit: 50,
    } as never),
  )) as unknown as RawRow[];
  const list = rows.map(narrow);
  return list.sort((a, b) => {
    if (a.currency_code === "BDT") return -1;
    if (b.currency_code === "BDT") return 1;
    return a.currency_code.localeCompare(b.currency_code);
  });
}

/** Every currency_rate row (active or not). Admin-only. */
export async function listAllCurrenciesForAdmin(): Promise<CurrencyRate[]> {
  const rows = (await directusServer().request(
    readItems("currency_rate" as never, {
      sort: ["currency_code"],
      fields: FIELDS as unknown as string[],
      limit: 100,
    } as never),
  )) as unknown as RawRow[];
  return rows.map(narrow);
}

/** Look up by ISO code. Returns null if missing or inactive (unless includeInactive). */
export async function getCurrencyByCode(
  code: string,
  opts: { includeInactive?: boolean } = {},
): Promise<CurrencyRate | null> {
  const upper = code.toUpperCase();
  const rows = (await directusServer().request(
    readItems("currency_rate" as never, {
      filter: { currency_code: { _eq: upper } },
      fields: FIELDS as unknown as string[],
      limit: 1,
    } as never),
  )) as unknown as RawRow[];
  if (rows.length === 0) return null;
  const rate = narrow(rows[0]);
  if (!opts.includeInactive && !rate.is_active) return null;
  return rate;
}

/** Look up by Directus row id (admin-only). */
export async function getCurrencyById(id: string): Promise<CurrencyRate | null> {
  try {
    const row = (await directusServer().request(
      readItem("currency_rate" as never, id, {
        fields: FIELDS as unknown as string[],
      } as never),
    )) as unknown as RawRow | null;
    return row ? narrow(row) : null;
  } catch {
    return null;
  }
}

// ---------- conversions ----------

export interface DonorAmount {
  /** Whole units in donor currency (e.g. 18 for $18). */
  amount: number;
  currency_code: string;
  symbol: string;
}

/**
 * Convert a whole-BDT amount to the donor's display currency.
 * Result is rounded to whole units (the package cards show "$18",
 * not "$18.18" — at preset-card granularity, fractional cents are
 * noise). The true exact donor charge is computed at checkout time
 * from the same rate and may differ by 1 unit due to rounding.
 */
export function convertBdtToCurrency(
  amountBdt: number,
  rate: CurrencyRate,
): DonorAmount {
  if (rate.bdt_per_unit <= 0) {
    // Defensive — should never happen given schema validation
    return { amount: 0, currency_code: rate.currency_code, symbol: rate.symbol };
  }
  return {
    amount: Math.max(1, Math.round(amountBdt / rate.bdt_per_unit)),
    currency_code: rate.currency_code,
    symbol: rate.symbol,
  };
}

/**
 * Reverse: donor currency amount back to BDT-equivalent. Used at
 * checkout time to stamp the BDT amount in Stripe metadata for
 * finance reconciliation.
 */
export function convertCurrencyToBdt(
  amountInCurrency: number,
  rate: CurrencyRate,
): number {
  return Math.round(amountInCurrency * rate.bdt_per_unit);
}

/**
 * Per-currency display-side minimum that yields at least the
 * given BDT floor. Used to set <input min=…> on custom-amount
 * fields so the donor can't enter "1" GBP when the BDT floor
 * is 500.
 */
export function bdtFloorToCurrencyFloor(
  bdtFloor: number,
  rate: CurrencyRate,
): number {
  if (rate.bdt_per_unit <= 0) return bdtFloor;
  return Math.max(1, Math.ceil(bdtFloor / rate.bdt_per_unit));
}
