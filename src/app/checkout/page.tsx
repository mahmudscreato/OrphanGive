import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { hydrateCart, readCart } from "@/lib/cart-data";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { getStripePublishableKey, getUsdToBdtRate } from "@/lib/stripe-client";
import { CheckoutOrderSummary } from "@/components/checkout/CheckoutOrderSummary";
import { PaymentMethodPicker } from "@/components/checkout/PaymentMethodPicker";
import { CheckoutInitializer } from "@/components/checkout/CheckoutInitializer";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Checkout — OrphanGive",
};

export default async function CheckoutPage() {
  // Auth gate
  const donor = await getCurrentDonor();
  if (!donor) {
    redirect("/signin?next=/checkout");
  }

  const state = getDonorState(donor);
  const isApproved = state === "approved";
  const stripeConfigured = Boolean(getStripePublishableKey());
  const bdtRate = getUsdToBdtRate();

  // Cart loaded server-side for the order summary (always shown).
  const cart = await readCart();
  const hydrated = cart
    ? await hydrateCart(cart)
    : { items: [], monthlyTotal: 0, oneTimeTotal: 0 };

  // Empty cart short-circuit.
  if (hydrated.items.length === 0) {
    return (
      <main className="bg-cream">
        <section className="px-6 pt-32 pb-24 max-md:pt-28 max-md:pb-16">
          <div className="max-w-[640px] mx-auto text-center">
            <h1 className="font-display text-[32px] text-ink leading-tight">
              Your cart is empty.
            </h1>
            <p className="mt-3 text-[15px] text-slate">
              Browse children to find someone to sponsor.
            </p>
            <Link
              href="/children"
              className="inline-flex mt-6 items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-7 py-3 text-[14px] hover:bg-tangerine-deep hover:shadow-warm transition-all"
            >
              Browse children →
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
  const totalUsd = hydrated.monthlyTotal + hydrated.oneTimeTotal;

  return (
    <main className="min-h-screen grid grid-cols-[2fr_3fr] max-lg:grid-cols-1">
      {/* Left: tangerine warmth panel */}
      <aside className="bg-tangerine text-cream relative overflow-hidden flex flex-col px-12 py-16 max-md:px-7 max-md:py-12">
        <div
          className="logo-motif"
          aria-hidden="true"
          style={{
            top: -50, right: -50,
            width: 360, height: 360,
            opacity: 0.08,
            transform: "rotate(15deg)",
          }}
        />
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display text-[22px] font-medium text-cream tracking-[-0.01em]">
            <Image
              src="/logo-mark.png"
              alt="OrphanGive"
              width={36}
              height={36}
              className="w-9 h-9"
              priority
            />
            OrphanGive
          </Link>
        </div>
        <div className="relative z-10 mt-auto pt-16 max-md:pt-10">
          <h1 className="font-display font-normal text-cream leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,4vw,3.5rem)]">
            Hey {firstName},
            <br />
            <em className="italic">let&apos;s change a child&apos;s tomorrow.</em>
          </h1>
          <p className="mt-7 text-[16px] text-cream/85 leading-[1.65] max-w-[460px]">
            Each sponsorship is a relationship. The child you&apos;re sponsoring
            will know your name, see your support arrive, and grow knowing
            someone believes in them.
          </p>
          <div className="mt-12 font-mono text-[11px] tracking-[0.14em] uppercase text-cream/60">
            Children&apos;s Heaven Trust · Bangladesh
          </div>
        </div>
      </aside>

      {/* Right: order + payment */}
      <section className="bg-cream px-10 py-14 overflow-y-auto max-md:px-6 max-md:py-10">
        <div className="max-w-[640px] mx-auto space-y-7">
          {!isApproved ? (
            <div className="rounded-[18px] bg-[#FEF6EC] border border-tangerine-soft border-l-[4px] border-l-tangerine px-5 py-4">
              <div className="font-display text-[17px] text-ink font-medium">
                Your account is awaiting approval.
              </div>
              <p className="mt-1.5 text-[13.5px] text-slate leading-[1.6]">
                Your cart is saved. Once approved (usually 1–2 business days),
                you&apos;ll be able to complete checkout.
              </p>
            </div>
          ) : null}

          <CheckoutOrderSummary
            items={hydrated.items}
            monthlyTotal={hydrated.monthlyTotal}
            oneTimeTotal={hydrated.oneTimeTotal}
            bdtRate={bdtRate}
          />

          {!stripeConfigured ? (
            <div className="rounded-[18px] bg-[#FEEFEF] border border-[#F4C7C7] px-5 py-4">
              <div className="font-display text-[17px] text-[#A02B2B] font-medium">
                Payment not configured.
              </div>
              <p className="mt-1.5 text-[13.5px] text-[#A02B2B]/80 leading-[1.6]">
                Add <code className="font-mono">STRIPE_SECRET_KEY</code> and{" "}
                <code className="font-mono">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>{" "}
                to <code className="font-mono">.env.local</code> to enable card
                payments.
              </p>
            </div>
          ) : !isApproved ? (
            <PaymentMethodPicker
              monthlyTotalUsd={hydrated.monthlyTotal}
              oneTimeTotalUsd={hydrated.oneTimeTotal}
              bdtRate={bdtRate}
              stripeForm={
                <button
                  type="button"
                  disabled
                  className="w-full inline-flex items-center justify-center font-body font-semibold rounded-full bg-ink text-cream px-6 py-[14px] text-[15px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Approval required to pay
                </button>
              }
            />
          ) : (
            <PaymentMethodPicker
              monthlyTotalUsd={hydrated.monthlyTotal}
              oneTimeTotalUsd={hydrated.oneTimeTotal}
              bdtRate={bdtRate}
              stripeForm={<CheckoutInitializer totalUsd={totalUsd} />}
            />
          )}
        </div>
      </section>
    </main>
  );
}
