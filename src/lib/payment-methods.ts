import type Stripe from "stripe";
import { getStripe } from "./stripe-client";

// Shared shape returned by every payment-method API route. Slim by
// design — the UI only needs brand, last4, expiry, and default flag.
export type PublicPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  isDefault: boolean;
};

function publicShape(
  pm: Stripe.PaymentMethod,
  defaultPmId: string | null,
): PublicPaymentMethod {
  // Cards are the only kind we surface today. If a non-card PM ever
  // sneaks in (Apple Pay, link, etc.) the brand/last4/exp fall back to
  // sensible placeholders so the UI doesn't crash.
  const card = pm.card;
  return {
    id: pm.id,
    brand: card?.brand ?? pm.type ?? "card",
    last4: card?.last4 ?? "••••",
    exp_month: card?.exp_month ?? 0,
    exp_year: card?.exp_year ?? 0,
    isDefault: defaultPmId !== null && pm.id === defaultPmId,
  };
}

// Fetches the donor's saved cards + the default-payment-method id from
// the customer's invoice_settings. Returns an empty list if the donor
// has no Stripe customer yet.
export async function listDonorPaymentMethods(
  customerId: string | null,
): Promise<PublicPaymentMethod[]> {
  if (!customerId) return [];
  const stripe = getStripe();
  const [pmsRes, customer] = await Promise.all([
    stripe.paymentMethods.list({ customer: customerId, type: "card" }),
    stripe.customers.retrieve(customerId),
  ]);
  const defaultPmId =
    !("deleted" in customer) || customer.deleted !== true
      ? typeof customer.invoice_settings?.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : (customer.invoice_settings?.default_payment_method as
            | Stripe.PaymentMethod
            | null
            | undefined)?.id ?? null
      : null;
  return pmsRes.data.map((pm) => publicShape(pm, defaultPmId));
}

// Verifies a payment-method id belongs to a given customer. All write
// routes call this before attaching/detaching/promoting so a donor can
// never operate on someone else's PM.
export async function assertPaymentMethodOwnedBy(
  paymentMethodId: string,
  customerId: string,
): Promise<Stripe.PaymentMethod> {
  const stripe = getStripe();
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  const owner =
    typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null;
  if (owner !== customerId) {
    throw new Error("Payment method does not belong to this customer.");
  }
  return pm;
}
