// MERGED 3 June 2026 — assembled verbatim (selection + ordering only, no new
// policy sentences authored) from two prior sources:
//   (a) the previously-published Directus CMS row (slug "refund"), and
//   (b) the prior hardcoded LegalPageLayout version (counsel-reviewed 2026-05-13).
// Per founder decision the CMS text is authoritative where the two conflict
// (timelines, jurisdiction, 30-day change notice, cancellation handling); the
// hardcoded-only "Currency & foreign exchange" section is kept (additive), and
// the hardcoded "Prepaid sponsorships" section is kept because the CMS source
// has no prepaid clause (see FLAG below). The only text change is contact-
// address consolidation: the refunds and hello mailboxes were both routed to
// support@orphangive.org.
//
// PENDING re-review by Bangladesh counsel before publication.

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

const SUPPORT_LINK_CLS =
  "text-tangerine-deep underline-offset-4 hover:underline font-medium";

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
      lastUpdated="3 June 2026"
      closingTopic="a donation"
      sections={[
        {
          // [CMS] "Our position"
          id: "position",
          title: "1. Our position",
          content: (
            <>
              <p>
                OrphanGive is a long-form commitment. Sponsorships fund the daily
                welfare of real children &mdash; their meals, their school fees,
                their books, their healthcare. Once a payment has been received
                and applied, it cannot simply be returned without affecting the
                child it was meant to support.
              </p>
              <p>
                That said, mistakes happen. Cards get charged twice.
                Subscriptions continue past their intended end. Sponsors change
                their minds within the first days of giving. We recognise these
                realities and have built a refund process that is fair to donors
                and protective of the children we serve.
              </p>
              <p>
                This policy explains when refunds are possible, how to request
                one, and what happens after you do.
              </p>
            </>
          ),
        },
        {
          // [CMS] "When refunds are available"
          id: "available",
          title: "2. When refunds are available",
          content: (
            <>
              <p>
                We will process a full refund in the following circumstances, no
                questions asked:
              </p>
              <LegalList
                items={[
                  <>
                    <strong>Duplicate charges</strong>: if our system or your
                    bank has charged you twice for the same sponsorship, we
                    refund the duplicate immediately on receipt of your notice.
                  </>,
                  <>
                    <strong>Unauthorised charges</strong>: if a charge was made
                    on your card without your knowledge or consent &mdash;
                    including through fraudulent account access &mdash; we refund
                    and we report the matter as required.
                  </>,
                  <>
                    <strong>Technical errors</strong>: if a payment was made due
                    to a clear bug in our service, we refund and we fix the bug.
                  </>,
                  <>
                    <strong>Cancellation within forty-eight hours</strong>: if
                    you change your mind about a sponsorship within forty-eight
                    hours of the initial payment, we refund in full, no
                    explanation required. This is your no-questions cooling-off
                    window.
                  </>,
                ]}
              />
              <p>
                We will consider refunds on a case-by-case basis in the following
                circumstances:
              </p>
              <LegalList
                items={[
                  <>
                    <strong>Personal hardship</strong>: if your financial
                    situation has changed materially since you began sponsoring,
                    write to us. We may refund recent payments and pause future
                    ones.
                  </>,
                  <>
                    <strong>Service failures</strong>: if we have substantially
                    failed to deliver what we promised &mdash; failed to provide
                    updates for an extended period, lost contact with a sponsored
                    child, or made administrative errors that materially affected
                    your experience &mdash; we will refund affected payments and
                    work with you to make it right.
                  </>,
                  <>
                    <strong>Misunderstandings</strong>: if you signed up
                    believing the service was something different from what we
                    provide, we will refund and we will improve our communication
                    so others do not make the same misunderstanding.
                  </>,
                ]}
              />
              <p>
                In all case-by-case situations, we aim to respond within seven
                days and to make a decision that respects both the donor&apos;s
                circumstances and the welfare of the child.
              </p>
            </>
          ),
        },
        {
          // [CMS] "When refunds are not available"
          id: "not-available",
          title: "3. When refunds are not available",
          content: (
            <>
              <p>
                Refunds are not typically issued in the following situations:
              </p>
              <LegalList
                items={[
                  <>
                    <strong>Payments older than ninety days</strong>: funds
                    applied to a child&apos;s welfare more than ninety days ago
                    have already been spent on their behalf. Returning them would
                    harm the child. We will work with you on cancellation of
                    future payments, but historical contributions are generally
                    final.
                  </>,
                  <>
                    <strong>One-time gifts</strong>: a one-time charitable
                    donation made in full knowledge of what it was for is, by its
                    nature, final. We may make exceptions for personal hardship as
                    described above.
                  </>,
                  <>
                    <strong>
                      Mid-month cancellations of an active monthly sponsorship
                    </strong>
                    : if you cancel partway through a sponsored month, the
                    month&apos;s payment has already been applied. Your
                    cancellation takes effect for the next billing cycle.
                  </>,
                  <>
                    <strong>Disagreements with our service direction</strong>: if
                    you disagree with our editorial choices, our partner
                    organisations, or our public positions, you are welcome to
                    cancel future sponsorships, but we do not refund past
                    contributions on grounds of changed views.
                  </>,
                ]}
              />
              <p>
                We exercise judgement, not strict policy. If your situation does
                not fit any category above, write to us. We will respond like
                human beings, not like a help desk.
              </p>
            </>
          ),
        },
        {
          // [HARDCODED] "Prepaid sponsorships"
          // FLAG: the CMS source has NO prepaid (paid-in-advance, multi-month)
          // clause, so per the founder fallback rule this hardcoded section was
          // retained rather than dropped. Founder to confirm.
          id: "prepaid",
          title: "4. Prepaid sponsorships",
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
          // [CMS] "How to request a refund" (email consolidated to support@)
          id: "request",
          title: "5. How to request a refund",
          content: (
            <>
              {/* FLAG: CMS originally listed a refunds mailbox with a hello
                  mailbox offered as an alternative ("… or … if that is more
                  convenient"). Per the email-consolidation both became
                  support@, making the alternative redundant, so it was removed.
                  Founder to confirm. */}
              <p>
                Send an email to{" "}
                <a
                  href="mailto:support@orphangive.org"
                  className={SUPPORT_LINK_CLS}
                >
                  support@orphangive.org
                </a>{" "}
                with the following:
              </p>
              <LegalList
                items={[
                  "The email address on your OrphanGive account",
                  "The approximate date and amount of the payment in question",
                  "A brief explanation of the situation — one or two sentences is enough",
                ]}
              />
              <p>
                You do not need to provide bank statements, screenshots, or
                documentation in your first message. If we need anything specific
                to process the refund, we will ask.
              </p>
              <p>
                We aim to respond to all refund requests within three working
                days. Once approved, refunds typically appear in your account
                within five to ten working days, depending on your card issuer.
                For payments made by certain methods &mdash; bank transfer,
                mobile money in Bangladesh &mdash; the timeline may be longer.
              </p>
            </>
          ),
        },
        {
          // [CMS] "What happens to a sponsored child after a refund"
          id: "after-refund",
          title: "6. What happens to a sponsored child after a refund",
          content: (
            <>
              <p>
                When a sponsorship is cancelled &mdash; whether through refund,
                withdrawal, or natural completion &mdash; the child returns to our
                list of children awaiting sponsorship. Their welfare is not
                interrupted; Children&apos;s Heaven Trust maintains a reserve fund
                that bridges the gap between sponsors, so no child experiences a
                sudden loss of support due to a cancellation.
              </p>
              <p>
                We do not contact you, pressure you, or attempt to retain you when
                you cancel. We treat sponsor relationships as voluntary and
                respect the right to withdraw at any time.
              </p>
            </>
          ),
        },
        {
          // [CMS] "Stripe and your bank"
          id: "stripe-bank",
          title: "7. Stripe and your bank",
          content: (
            <>
              <p>
                All payment processing is handled by Stripe. When we issue a
                refund, it is processed through Stripe back to the original
                payment method. We cannot refund to a different card or account
                than the one originally used.
              </p>
              <p>
                If your card has expired or been replaced since the original
                payment, refunds typically still reach you &mdash; Stripe forwards
                refunds to the card&apos;s replacement on most major issuers. If a
                refund does not arrive within ten working days, contact us and we
                will work with Stripe to resolve it.
              </p>
            </>
          ),
        },
        {
          // [HARDCODED] "Currency & foreign exchange" (additive, kept per founder)
          id: "currency",
          title: "8. Currency & foreign exchange",
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
          // [CMS] "Disputed charges"
          id: "disputed",
          title: "9. Disputed charges",
          content: (
            <>
              <p>
                If you have a concern about a charge, please write to us before
                opening a dispute with your bank or card issuer. A bank
                chargeback is a heavy process that costs us significant
                administrative time and can result in our payment processing being
                suspended. We can almost always resolve concerns directly and
                faster than a chargeback can.
              </p>
              <p>
                If we cannot resolve a concern to your satisfaction within
                fourteen days, you retain the right to dispute the charge with
                your bank, and we will cooperate fully with that process.
              </p>
            </>
          ),
        },
        {
          // [CMS] "Governing law"
          id: "governing-law",
          title: "10. Governing law",
          content: (
            <>
              <p>
                This refund policy is governed by the laws of Bangladesh.
                Children&apos;s Heaven Trust is registered with the NGO Affairs
                Bureau of Bangladesh under Registration No. iv-98/2021. Disputes
                regarding refunds are subject to the jurisdiction of the courts of
                Dhaka, Bangladesh.
              </p>
            </>
          ),
        },
        {
          // [CMS] "Changes to this policy"
          id: "changes",
          title: "11. Changes to this policy",
          content: (
            <>
              {/* CONFLICT: CMS says the "Last updated" date is "at the bottom of
                  this page"; in LegalPageLayout it is shown at the TOP (the
                  hardcoded version said "top"). Kept CMS verbatim — founder to
                  correct the word if desired. */}
              <p>
                We may update this refund policy from time to time. The
                &quot;Last updated&quot; date at the top of this page will
                reflect any changes. For material changes, we will email active
                sponsors at least thirty days before the change takes effect.
              </p>
            </>
          ),
        },
        {
          // [CMS] "Contact"
          id: "contact",
          title: "12. Contact",
          content: (
            <>
              <p>For any refund request or any question about this policy:</p>
              <p>
                <strong>Children&apos;s Heaven Trust</strong> &amp;{" "}
                <strong>Goodverse Foundation</strong>
                <br />
                Operating OrphanGive
                <br />
                Email:{" "}
                <a
                  href="mailto:support@orphangive.org"
                  className={SUPPORT_LINK_CLS}
                >
                  support@orphangive.org
                </a>
              </p>
              <p>We are a small team and we read every message.</p>
            </>
          ),
        },
      ]}
    />
  );
}
