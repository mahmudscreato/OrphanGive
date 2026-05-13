import Link from "next/link";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { hydrateCart, readCart } from "@/lib/cart-data";
import { CartContent } from "./cart-content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your cart — OrphanGive",
};

export default async function CartPage() {
  const cart = await readCart();
  const hydrated = cart
    ? await hydrateCart(cart)
    : {
        items: [],
        monthlyTotal: 0,
        oneTimeTotal: 0,
        monthlyRecurringTotal: 0,
        monthlyPrepaidTotal: 0,
        oneTimeOnlyTotal: 0,
        totalAmountUsd: 0,
        donorId: null,
        status: "active" as const,
        id: "",
        token: "",
      };
  return (
    <div className="bg-cream">
      <div className="px-6 pt-32 max-md:pt-28">
        <div className="max-w-[900px] mx-auto">
          <Breadcrumb crumbs={[{ href: "/", label: "Home" }, { label: "Cart" }]} />
        </div>
      </div>
      <section className="px-6 pt-8 pb-24 max-md:pt-6 max-md:pb-16">
        <div className="max-w-[900px] mx-auto">
          <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
            Your cart
          </h1>
          {hydrated.items.length === 0 ? (
            <div className="mt-10 rounded-[28px] bg-white border border-ink/[0.06] p-12 text-center max-md:p-8">
              <div className="font-display text-[24px] text-ink mb-4">Your cart is empty.</div>
              <p className="text-[15px] text-slate mb-6 max-w-[440px] mx-auto leading-[1.6]">
                Find a child whose story moves you and add a sponsorship to your cart.
              </p>
              <Link
                href="/children"
                className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-7 py-3 text-[14px] hover:bg-tangerine-deep hover:shadow-warm transition-all"
              >
                Browse children →
              </Link>
            </div>
          ) : (
            <CartContent
              items={hydrated.items}
              monthlyRecurringTotal={hydrated.monthlyRecurringTotal}
              monthlyPrepaidTotal={hydrated.monthlyPrepaidTotal}
              oneTimeOnlyTotal={hydrated.oneTimeOnlyTotal}
            />
          )}
        </div>
      </section>
    </div>
  );
}
