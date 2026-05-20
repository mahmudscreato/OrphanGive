// Session 58.3 — restored from commit 4b3c7fa~1, rewired to consume
// donation_package rows from Directus instead of the deleted
// SPONSORSHIP_TIERS constant. Visual structure preserved.
//
// Each tile shows the donor-currency amount prominently with a
// "≈ X BDT" subtext, and the package's name + description. The
// donor-currency conversion happens server-side via
// convertBdtToCurrency; we pass the pre-converted amount in.

"use client";

export interface TierItem {
  /** donation_package.id */
  id: string;
  name: string;
  /** Optional short description; description_en wrapped for the card. */
  description: string | null;
  /** Pre-converted donor-currency amount (whole units). */
  donorAmount: number;
  /** The underlying BDT amount, shown as "≈ X BDT" subtext. */
  amountBdt: number;
}

type Props = {
  items: ReadonlyArray<TierItem>;
  selectedTierId: string | null;
  onSelect: (tierId: string) => void;
  /** Monthly = "/month" suffix; one-time = "" */
  perMonth: boolean;
  /** Donor's currency symbol (e.g. "$", "৳", "£"). */
  currencySymbol: string;
  /** Donor's ISO code (e.g. "USD"); shown as a small label after the amount. */
  currencyCode: string;
};

export function TierGrid({
  items,
  selectedTierId,
  onSelect,
  perMonth,
  currencySymbol,
  currencyCode,
}: Props) {
  const suffix = perMonth ? "/month" : "";
  return (
    <div
      role="radiogroup"
      aria-label="Sponsorship amount"
      className="grid grid-cols-2 gap-3 max-md:grid-cols-1"
    >
      {items.map((tier) => {
        const active = selectedTierId === tier.id;
        return (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(tier.id)}
            className={`text-left rounded-[16px] p-5 transition-all duration-[200ms] ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tangerine focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas ${
              active
                ? "bg-tangerine-mist border-[2px] border-tangerine shadow-warm"
                : "bg-white border-[2px] border-ink/[0.08] hover:border-tangerine-soft hover:-translate-y-px"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[26px] text-ink leading-none">
                {currencySymbol}
                {tier.donorAmount.toLocaleString()}
                <span className="text-[14px] text-slate-soft">{suffix}</span>
              </span>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-tangerine-deep">
                {currencyCode}
              </span>
            </div>
            <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.10em] text-slate-soft">
              ≈ ৳{tier.amountBdt.toLocaleString()}
              {perMonth ? " / mo" : ""}
            </div>
            {tier.description ? (
              <p className="mt-2 text-[13.5px] text-slate leading-snug">
                {tier.name}
                {tier.description ? ` — ${tier.description}` : ""}
              </p>
            ) : (
              <p className="mt-2 text-[13.5px] text-slate leading-snug">
                {tier.name}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Helper to convert a row carrying {id, name_en, description_en,
 * amount_bdt} into a TierItem with the donor-currency amount
 * computed. Accepts either full DonationPackage objects or the
 * narrower PackageData the sponsor orchestrator uses — both have
 * the fields we read.
 */
export function packagesToTierItems(
  packages: ReadonlyArray<{
    id: string;
    name_en: string;
    description_en: string;
    amount_bdt: number;
  }>,
  bdtPerDonorUnit: number,
): TierItem[] {
  return packages.map((p) => ({
    id: p.id,
    name: p.name_en,
    description: p.description_en || null,
    donorAmount:
      bdtPerDonorUnit > 0
        ? Math.max(1, Math.round(p.amount_bdt / bdtPerDonorUnit))
        : 0,
    amountBdt: p.amount_bdt,
  }));
}

export default TierGrid;
