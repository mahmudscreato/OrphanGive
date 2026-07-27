import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getChildById } from "@/lib/child-profile-data";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { readCart } from "@/lib/cart-data";
import { getActiveMonthlySponsorForChild } from "@/lib/sponsorship-data";
import {
  computeNextQueueSlot,
  getQueueForChild,
  QUEUE_DEPTH_LIMIT,
} from "@/lib/queue";
import {
  listActiveMonthlyTiers,
  listOneTimeQuickAmounts,
  listOneTimeGifts,
  getMinimumActiveMonthlyAmountBdt,
} from "@/lib/donation-packages";
import { listActiveCurrencies } from "@/lib/currency-rates";
import { resolveDonorCurrencyWithLock } from "@/lib/geo-currency";
import { SponsorPageContent } from "./sponsor-page-content";

const ONE_TIME_FLOOR_BDT = 1500;

export const dynamic = "force-dynamic";

export default async function SponsorPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { childId } = await params;

  // fix/resume-at-payment-after-signup — `rs` is a JSON snapshot of the
  // donor's in-progress selections, carried back through signup so the client
  // restores them and resumes at the payment step. null = fresh entry.
  const sp = await searchParams;
  const rsParam = sp.rs;
  const resume =
    typeof rsParam === "string"
      ? rsParam
      : Array.isArray(rsParam)
        ? rsParam[0] ?? null
        : null;

  // fix/child-support-flow — NO sign-in gate at entry. Guests enter the SAME
  // flow (select mode → amount/package → cause → visibility → review). The
  // account requirement is applied at the PAYMENT step (Step 6) inside
  // sponsor-page-content: MONTHLY requires signup (recurring needs an
  // identified sponsor); ONE-TIME completes as a guest_donation (child-tagged)
  // with inline name/email/phone, or the donor may sign up. Logged-in donors
  // keep the existing proven flow unchanged. All donor-keyed reads below are
  // guest-safe (getDonorState(null)='unauthenticated'; resolveDonorCurrency-
  // WithLock(null) falls back to geo currency; readCart() returns null).
  const donor = await getCurrentDonor();

  // Use admin tier for the fetch — sponsor page only displays public-safe
  // fields, but we want full reliability regardless of viewer role.
  const child = await getChildById(childId, "admin");
  if (!child) notFound();

  const donorState = getDonorState(donor);

  const cart = await readCart();
  const cartItemCount = cart?.items.length ?? 0;

  // Session 14.6 + 14.7: child-lock branches. Three exclusive UI
  // states relative to the viewing donor:
  //
  //   selfActiveMonthly  — viewing donor IS the active monthly
  //                        sponsor. Friendly informational banner
  //                        with a link to /dashboard/sponsorship/[id].
  //                        Monthly tile enabled; same-donor exemption.
  //   queueJoin          — child has an active monthly sponsor (a
  //                        different donor) AND queue isn't full.
  //                        Monthly tile is enabled but renders
  //                        "Get in line" copy; queueJoin carries
  //                        position + estimated start date.
  //   monthlyLocked      — child has an active monthly sponsor AND
  //                        the queue is FULL (3 queued already).
  //                        Monthly tile disabled with "Queue is full
  //                        through [date]" copy.
  //
  // /api/checkout/init re-evaluates the queue depth at init time as
  // the race-condition guard (sponsor flow can render stale slot
  // info if the page was open while another donor checked out).
  const activeMonthly = await getActiveMonthlySponsorForChild(child.id);
  const isOwnActiveMonthly = Boolean(
    donor && activeMonthly && activeMonthly.donorId === donor.id,
  );

  let monthlyLocked = false;
  let queueJoin: {
    position: number;
    estimatedStartsAt: string | null;
    activeEndDate: string | null;
    donorsAhead: number;
  } | null = null;
  let queueFullThrough: string | null = null;
  const selfActiveMonthly =
    isOwnActiveMonthly && activeMonthly
      ? {
          sponsorshipId: activeMonthly.sponsorshipId,
          scheduledEndDate: activeMonthly.scheduledEndDate,
        }
      : null;

  if (activeMonthly && !isOwnActiveMonthly) {
    const slot = await computeNextQueueSlot(child.id);
    if (slot.position > QUEUE_DEPTH_LIMIT) {
      // Queue full — render the locked state with the final queued
      // donor's end date as the "come back after" target.
      const { queued } = await getQueueForChild(child.id);
      const last = queued[queued.length - 1];
      queueFullThrough = last?.queued_ends_at ?? null;
      monthlyLocked = true;
    } else {
      // Queue join is available. donorsAhead = position - 1
      // (donors already in the queue PLUS the current active sponsor
      // ahead of you). For donor-facing copy we count "ahead of you"
      // inclusive of the active sponsor: position 1 → 1 donor ahead.
      queueJoin = {
        position: slot.position,
        estimatedStartsAt: slot.startsAt
          ? slot.startsAt.toISOString()
          : null,
        activeEndDate: slot.activeEndDate
          ? slot.activeEndDate.toISOString()
          : null,
        donorsAhead: slot.position,
      };
    }
  }

  return (
    <div className="bg-cream">
      <div className="px-6 pt-32 max-md:pt-28">
        <div className="max-w-[1100px] mx-auto">
          <Breadcrumb
            crumbs={[
              { href: "/", label: "Home" },
              { href: "/children", label: "Browse children" },
              { href: `/children/${child.id}`, label: child.display_name },
              { label: "Sponsor" },
            ]}
          />
        </div>
      </div>
      <SponsorPageContentWithData
        donor={donor}
        child={{
          id: child.id,
          display_name: child.display_name,
          age: child.age,
          district: child.district,
          photo: child.photo,
          story: child.story,
          story_truncated: child.story_truncated,
        }}
        donorState={donorState}
        cartItemCount={cartItemCount}
        monthlyLocked={monthlyLocked}
        selfActiveMonthly={selfActiveMonthly}
        queueJoin={queueJoin}
        queueFullThrough={queueFullThrough}
        resume={resume}
      />
    </div>
  );
}

// Session 58.3 — server-component shim that loads Directus data (active
// packages by subtype + currency rate + currency options) and threads
// it into the client SponsorPageContent. Kept inline to avoid an extra
// file just for the data fetch. The outer page (above) already does
// all the donor / queue / child logic; this wrapper exists purely to
// pair that with the new package data layer.
async function SponsorPageContentWithData({
  donor,
  child,
  donorState,
  cartItemCount,
  monthlyLocked,
  selfActiveMonthly,
  queueJoin,
  queueFullThrough,
  resume,
}: {
  donor: Awaited<ReturnType<typeof getCurrentDonor>>;
  child: {
    id: string;
    display_name: string;
    age: number | null;
    district: string | null;
    photo: string | null;
    story: string | null;
    story_truncated: boolean;
  };
  donorState: ReturnType<typeof getDonorState>;
  cartItemCount: number;
  monthlyLocked: boolean;
  selfActiveMonthly: {
    sponsorshipId: string;
    scheduledEndDate: string | null;
  } | null;
  queueJoin: {
    position: number;
    estimatedStartsAt: string | null;
    activeEndDate: string | null;
    donorsAhead: number;
  } | null;
  queueFullThrough: string | null;
  resume: string | null;
}) {
  // Parallel fetches: 3 package reads + currency list + donor's
  // current currency. All server-only.
  //
  // Session 58.3.2 — resolveDonorCurrencyWithLock reads the Stripe
  // customer's currency (if any) and locks to it. Donors who have
  // already transacted get the picker pre-set to their committed
  // currency so the "cannot combine currencies on a single customer"
  // Stripe error never surfaces.
  const [
    monthlyTiers,
    oneTimeQuick,
    oneTimeGifts,
    currencies,
    rateResult,
    monthlyMinBdt,
  ] = await Promise.all([
    listActiveMonthlyTiers(),
    listOneTimeQuickAmounts(),
    listOneTimeGifts(),
    listActiveCurrencies(),
    resolveDonorCurrencyWithLock(donor),
    getMinimumActiveMonthlyAmountBdt(),
  ]);
  const rate = rateResult.rate;
  const currencyLocked = rateResult.locked;

  return (
    <SponsorPageContent
      child={child}
      signedIn={Boolean(donor)}
      donorState={donorState}
      initialCartItemCount={cartItemCount}
      monthlyLocked={monthlyLocked}
      donorFirstName={donor?.first_name ?? null}
      selfActiveMonthly={selfActiveMonthly}
      queueJoin={queueJoin}
      queueFullThrough={queueFullThrough}
      resume={resume}
      monthlyTiers={monthlyTiers.map((p) => ({
        id: p.id,
        name_en: p.name_en,
        description_en: p.description_en,
        amount_bdt: p.amount_bdt,
        cause_tag: p.cause_tag,
        icon: p.icon,
      }))}
      oneTimeQuick={oneTimeQuick.map((p) => ({
        id: p.id,
        name_en: p.name_en,
        description_en: p.description_en,
        amount_bdt: p.amount_bdt,
        cause_tag: p.cause_tag,
        icon: p.icon,
      }))}
      oneTimeGifts={oneTimeGifts.map((p) => ({
        id: p.id,
        name_en: p.name_en,
        description_en: p.description_en,
        amount_bdt: p.amount_bdt,
        cause_tag: p.cause_tag,
        icon: p.icon,
      }))}
      currency={{
        code: rate.currency_code,
        symbol: rate.symbol,
        display_name: rate.display_name,
      }}
      currencyOptions={currencies.map((c) => ({
        code: c.currency_code,
        symbol: c.symbol,
        display_name: c.display_name,
      }))}
      bdtPerDonorUnit={rate.bdt_per_unit}
      monthlyMinBdt={monthlyMinBdt}
      oneTimeMinBdt={ONE_TIME_FLOOR_BDT}
      currencyLocked={currencyLocked}
    />
  );
}
