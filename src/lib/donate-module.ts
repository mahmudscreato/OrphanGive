// fix/donate-strip-polish — shared data loader for the DonateModule
// (the global bottom strip + the inspiring homepage section).
//
// FIX 1 — the module now offers the SAME 6 curated causes the sponsor flow
// uses (the cause taxonomy in @/lib/cause), not the ~18 raw one_time
// donation_package rows. Each of the 6 taxonomy labels is resolved
// SERVER-SIDE to a representative active one_time package id, because the
// guest checkout (POST /api/donate/guest-init) is package-based and charges
// by packageId. The payment path is unchanged — only the cause SOURCE the
// donor picks from changes.
//
// Mapping rule (founder decision): a cause maps to the active one_time
// package whose cause_tag equals the cause enum; causes with no matching
// tagged package (Family support, Eid blessing) fall back to a general
// "Where most needed" package, so every label always resolves to a valid,
// chargeable packageId.
//
// Runs in the ROOT layout (every route) + the homepage, so it is
// FAILURE-SAFE: any Directus error returns an empty cause list and the
// module hides itself rather than taking the whole site down.

import "server-only";

import {
  listActivePackages,
  type DonationPackage,
} from "@/lib/donation-packages";
import {
  bdtFloorToCurrencyFloor,
  getCurrencyByCode,
} from "@/lib/currency-rates";
import { CAUSES } from "@/lib/cause";

// The one-time BDT floor mirrored from /donate/quick + validateCustomAmount.
// Used only to derive the display-currency placeholder/pre-check; the server
// (guest-init) re-validates authoritatively.
const ONE_TIME_BDT_FLOOR = 500;

export interface DonateCause {
  /** Cause enum — the stable, unique <option> value + React key. */
  enum: string;
  /** Donor-facing label from the cause taxonomy (dropdown text). */
  label: string;
  /** Representative active one_time package id — what guest-init charges. */
  packageId: string;
}

export interface DonateModuleData {
  causes: DonateCause[];
  currencySymbol: string;
  currencyCode: string;
  customFloor: number;
}

export async function loadDonateModuleData(): Promise<DonateModuleData> {
  try {
    const [packages, rate] = await Promise.all([
      listActivePackages("one_time"),
      getCurrencyByCode("USD"),
    ]);

    const symbol = rate?.symbol ?? "$";
    const code = rate?.currency_code ?? "USD";
    const customFloor = rate
      ? bdtFloorToCurrencyFloor(ONE_TIME_BDT_FLOOR, rate)
      : ONE_TIME_BDT_FLOOR;

    // Representative package for each cause. Prefer a package tagged with the
    // cause enum; otherwise fall back to a general package (an explicit
    // general_care tag, else the first untagged quick package, else the first
    // one_time package) so every taxonomy label resolves to a valid packageId.
    const firstByTag = (tag: string): DonationPackage | undefined =>
      packages.find((p) => p.cause_tag === tag);
    const generalPkg =
      firstByTag("general_care") ??
      packages.find((p) => !p.cause_tag) ??
      packages[0];

    if (!generalPkg) {
      // No active one_time packages → nothing to charge; hide the module.
      return { causes: [], currencySymbol: symbol, currencyCode: code, customFloor };
    }

    const causes: DonateCause[] = CAUSES.map((c) => {
      const pkg = firstByTag(c.enum) ?? generalPkg;
      return { enum: c.enum, label: c.label, packageId: pkg.id };
    });

    return { causes, currencySymbol: symbol, currencyCode: code, customFloor };
  } catch (err) {
    console.warn(
      "[donate-module] cause load failed — module hidden",
      err instanceof Error ? err.message : err,
    );
    return {
      causes: [],
      currencySymbol: "$",
      currencyCode: "USD",
      customFloor: ONE_TIME_BDT_FLOOR,
    };
  }
}
