import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { formatUsd } from "@/lib/pricing";
import type { HydratedCartItem } from "@/lib/cart-data";

type Props = {
  items: HydratedCartItem[];
  monthlyTotal: number;
  oneTimeTotal: number;
  bdtRate: number;
};

function formatBdt(usd: number, rate: number): string {
  const bdt = Math.round(usd * rate);
  return new Intl.NumberFormat("en-US").format(bdt);
}

function ItemRow({
  item,
  bdtRate,
  showDivider,
}: {
  item: HydratedCartItem;
  bdtRate: number;
  showDivider: boolean;
}) {
  const photoSrc = directusAssetUrl(item.photo);
  const isMonthly = item.paymentMode === "monthly";
  return (
    <div className={showDivider ? "pt-4 mt-4 border-t border-ink/[0.06]" : ""}>
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-tangerine-mist shrink-0">
          {photoSrc ? (
            <ProtectedChildImage
              src={photoSrc}
              alt={item.display_name ?? "Child"}
              width={120}
              height={120}
              quality={85}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="child-photo-placeholder" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[16px] text-ink leading-snug truncate">
            {item.display_name ?? "Child"}
          </div>
          <span
            className={`inline-flex mt-1 items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[9.5px] tracking-[0.12em] uppercase font-medium border ${
              isMonthly
                ? "bg-tangerine-mist text-tangerine-deep border-tangerine-soft"
                : "bg-moss-soft text-moss-deep border-moss/30"
            }`}
          >
            {isMonthly ? "Monthly" : "One-time"}
          </span>
        </div>
        <div className="text-right">
          <div className="font-display text-[18px] text-ink leading-none">
            {formatUsd(item.amountUsd)}
            <span className="text-[11px] text-slate-soft">
              {isMonthly ? "/month" : ""}
            </span>
          </div>
          <div className="text-[11px] text-slate-soft mt-0.5">
            ≈ BDT {formatBdt(item.amountUsd, bdtRate)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CheckoutOrderSummary({
  items,
  monthlyTotal,
  oneTimeTotal,
  bdtRate,
}: Props) {
  const monthlyItems = items.filter((i) => i.paymentMode === "monthly");
  const oneTimeItems = items.filter((i) => i.paymentMode === "one_time");

  return (
    <section className="rounded-[20px] bg-cream border border-ink/[0.06] p-6 max-md:p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-[22px] text-ink leading-none">
          Your sponsorships
        </h2>
        <Link
          href="/cart"
          className="text-[12px] text-tangerine-deeper border-b border-tangerine pb-0.5 hover:opacity-80"
        >
          Edit cart
        </Link>
      </div>

      {monthlyItems.length > 0 ? (
        <div>
          <h3 className="font-mono text-[10px] tracking-[0.14em] uppercase text-slate-soft mb-3">
            Monthly
          </h3>
          {monthlyItems.map((it, i) => (
            <ItemRow
              key={`${it.childId}-${it.paymentMode}`}
              item={it}
              bdtRate={bdtRate}
              showDivider={i > 0}
            />
          ))}
        </div>
      ) : null}
      {oneTimeItems.length > 0 ? (
        <div className={monthlyItems.length > 0 ? "mt-6 pt-6 border-t border-ink/[0.06]" : ""}>
          <h3 className="font-mono text-[10px] tracking-[0.14em] uppercase text-slate-soft mb-3">
            One-time
          </h3>
          {oneTimeItems.map((it, i) => (
            <ItemRow
              key={`${it.childId}-${it.paymentMode}`}
              item={it}
              bdtRate={bdtRate}
              showDivider={i > 0}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-6 pt-5 border-t-[1.5px] border-ink/[0.08] space-y-2.5">
        {monthlyTotal > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] text-slate">Monthly total</span>
            <div className="text-right">
              <div className="font-display text-[20px] text-ink leading-none">
                {formatUsd(monthlyTotal)}
                <span className="text-[12px] text-slate-soft">/month</span>
              </div>
              <div className="text-[11px] text-slate-soft mt-0.5">
                ≈ BDT {formatBdt(monthlyTotal, bdtRate)}/month
              </div>
            </div>
          </div>
        ) : null}
        {oneTimeTotal > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] text-slate">One-time total</span>
            <div className="text-right">
              <div className="font-display text-[20px] text-ink leading-none">
                {formatUsd(oneTimeTotal)}
              </div>
              <div className="text-[11px] text-slate-soft mt-0.5">
                ≈ BDT {formatBdt(oneTimeTotal, bdtRate)}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default CheckoutOrderSummary;
