// Counsel-reviewed: Bangladesh legal counsel reviewed and updated 2026-05-13.
// Any further changes should be reviewed before publication.

import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import {
  LegalPageLayout,
  LegalList,
} from "@/components/legal/LegalPageLayout";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("refund");
  return {
    title: page?.title ? `${page.title} — OrphanGive` : "Refund policy — OrphanGive",
    description:
      page?.meta_description ??
      "When and how donations through OrphanGive can be refunded.",
  };
}

export default async function RefundPage() {
  const page = await getSitePage("refund");

  if (page?.content) {
    return (
      <SitePageRenderer
        page={page}
        fallback={{
          title: "Refund policy",
          description:
            "When and how donations through OrphanGive can be refunded.",
        }}
      />
    );
  }

  return (
    <LegalPageLayout
      eyebrowText="Refund policy"
      headlinePart1="Donations support real children."
      headlinePart2="Refunds are limited."
      subCopy="We treat every donation as a real commitment to a real child. Funds are usually deployed quickly, which limits when a refund is possible. This policy explains the cases where a refund is available, and how to request one."
      lastUpdated="13 May 2026"
      closingTopic="a donation"
      sections={[
        {
          id: "general",
          title: "1. General principle",
          content: (
            <>
              <p>
                Donations made through OrphanGive flow quickly to the
                ground. A typical monthly sponsorship clears Stripe within
                seconds and is allocated to the sponsored child the same
                business day; a one-time gift tagged to schooling or
                healthcare may be deployed within days. Once funds have been
                deployed, refunds are not generally possible — the support
                has been delivered.
              </p>
              <p>
                That said, we recognise that mistakes happen, that
                unauthorised charges can occur, and that on rare occasions we
                may fall short of what we promised. The sections below cover
                those cases.
              </p>
            </>
          ),
        },
        {
          id: "available",
          title: "2. When refunds ARE available",
          content: (
            <>
              <LegalList
                items={[
                  <>
                    <strong>Duplicate or accidental charges (within 48 hours).</strong>{" "}
                    If you made a donation by mistake or were double-charged
                    due to a technical issue, contact us within 48 hours and
                    we will refund the affected charge in full.
                  </>,
                  <>
                    <strong>Demonstrable fraud or unauthorised charges.</strong>{" "}
                    If a charge was made to your card without your
                    authorisation, contact us immediately. We will refund the
                    full amount and investigate the source of the
                    unauthorised activity in coordination with Stripe&apos;s
                    fraud team.
                  </>,
                  <>
                    <strong>Failure to deliver promised support.</strong>{" "}
                    Rare, but possible. If OrphanGive and Children&apos;s
                    Heaven Trust together fail to deliver the support a
                    donation was tagged for — for reasons that are
                    attributable to us, not to force majeure — a pro-rated
                    refund of the un-delivered portion may be offered.
                  </>,
                  <>
                    <strong>Unused prepaid months on a cancelled prepaid sponsorship.</strong>{" "}
                    If you paid up-front for multiple months and cancel the
                    sponsorship before all months have been deployed, a
                    pro-rated refund of the genuinely unused months may be
                    offered at our discretion.
                  </>,
                ]}
              />
            </>
          ),
        },
        {
          id: "not-available",
          title: "3. When refunds are NOT available",
          content: (
            <>
              <LegalList
                items={[
                  "Change of mind after the donation has been deployed on the ground.",
                  "Completed monthly cycles in a recurring sponsorship — once a month's payment has been delivered to the child, it cannot be reclaimed.",
                  "Donations for which the donor has already claimed a tax-deductible benefit in any jurisdiction.",
                  "Donations made more than 90 days prior to the refund request, except in cases of demonstrable fraud.",
                  "Foreign-exchange losses arising from the FX rate Stripe applied at the time of the original charge. Where a refund is approved it will be issued in your original payment currency at the rate Stripe applies at the time of refund — which may differ from the original.",
                ]}
              />
            </>
          ),
        },
        {
          id: "request",
          title: "4. How to request a refund",
          content: (
            <>
              <p>
                Write to{" "}
                <a
                  href="mailto:refunds@orphangive.org"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  refunds@orphangive.org
                </a>{" "}
                from the email address associated with your donor account.
                Include:
              </p>
              <LegalList
                items={[
                  "The date and amount of the donation in question.",
                  "The last 4 digits of the card you used (so we can match the charge in Stripe).",
                  "A brief description of why you're requesting the refund.",
                ]}
              />
              <p>
                We will acknowledge your request within two business days
                and aim to resolve it within seven. If we approve the
                refund, Stripe typically credits the refunded amount back to
                your card within 5-10 business days. International cards may
                take longer depending on your issuing bank.
              </p>
            </>
          ),
        },
        {
          id: "monthly",
          title: "5. Cancelling a monthly sponsorship",
          content: (
            <>
              <p>
                You can cancel a monthly sponsorship at any time from your
                donor dashboard with one click. Cancellation has these
                effects:
              </p>
              <LegalList
                items={[
                  "Future monthly charges stop immediately.",
                  "Any completed monthly cycles before the cancellation date are NOT refunded — those funds have already been delivered.",
                  "The child you were sponsoring re-enters the waiting pool.",
                  "Your donor account remains open and you can sponsor another child whenever you choose.",
                ]}
              />
            </>
          ),
        },
        {
          id: "prepaid",
          title: "6. Prepaid sponsorships",
          content: (
            <>
              <p>
                A prepaid sponsorship is a recurring sponsorship paid in
                advance for a defined number of months (typically 3, 6, or
                12). Funds are deployed monthly even though payment was
                up-front. If you cancel before all the prepaid months have
                been deployed, you may request a pro-rated refund of the
                un-deployed months.
              </p>
              <p>
                Pro-rated refunds for unused prepaid months are
                issued at OrphanGive&apos;s discretion, subject to
                verification that the funds have not yet been
                deployed for the child&apos;s support.
              </p>
            </>
          ),
        },
        {
          id: "currency",
          title: "7. Currency & foreign exchange",
          content: (
            <>
              <p>
                Refunds are issued in the currency in which the original
                donation was charged. Where the original charge involved a
                foreign-exchange conversion (e.g. USD donated → BDT
                received), Stripe applies the FX rate at the time of refund,
                not the original time of charge. As a result the refunded
                amount in your original currency may be slightly higher or
                lower than the amount originally charged. We do not
                compensate for FX-rate movement.
              </p>
            </>
          ),
        },
        {
          id: "updates",
          title: "8. Updates to this policy",
          content: (
            <>
              <p>
                We may amend this policy from time to time. Material changes
                will be notified to active donors by email; non-material
                changes will be reflected by an updated &quot;Last updated&quot;
                date at the top of this page.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
