// Counsel-reviewed: Bangladesh legal counsel reviewed and updated 2026-05-13.
// Any further changes should be reviewed before publication.

import {
  LegalPageLayout,
  LegalList,
} from "@/components/legal/LegalPageLayout";

export const dynamic = "force-dynamic";

// P3 content lot — metadata is hardcoded. See sibling page in
// /privacy for the full rationale: the CMS site_page row had
// divergent (non-counsel-reviewed) attribution and would have
// suppressed the founder-approved Goodverse Foundation registration
// number (Reg. S-14837/2026).
export function generateMetadata() {
  return {
    title: "Terms of use — OrphanGive",
    description:
      "The rules and expectations governing your use of OrphanGive. Operated by Goodverse Foundation (Reg. S-14837/2026) in partnership with Children's Heaven Trust (Reg. iv-98/2021), Bangladesh.",
  };
}

export default function TermsPage() {
  // P3 content lot — CMS override DISABLED for this slug. See the
  // matching comment block in src/app/privacy/page.tsx for the
  // full rationale (counsel-reviewed content is the source of truth;
  // the CMS row carried older copy that misnamed the operating
  // entity). /cookies, /refund, /safeguarding still honour CMS.
  return (
    <LegalPageLayout
      eyebrowText="Terms of use"
      headlinePart1="The rules of the road."
      headlinePart2="Plainly written."
      subCopy="By using OrphanGive you agree to the terms below. They cover what we offer, what we ask of you, and what either of us can do if something goes wrong. Written to be understood — not to hide behind."
      lastUpdated="13 May 2026"
      closingTopic="these terms"
      sections={[
        {
          id: "acceptance",
          title: "1. Acceptance of these terms",
          content: (
            <>
              <p>
                By creating an account, making a donation, or otherwise using
                OrphanGive, you confirm that you have read, understood, and
                agree to be bound by these terms and by our{" "}
                <a
                  href="/privacy"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  Privacy Policy
                </a>
                . If you do not agree, please do not use the service.
              </p>
              <p>
                These terms form a binding agreement between you and{" "}
                <strong>Goodverse Foundation</strong> (Reg.
                S-14837/2026), the operating entity behind OrphanGive,
                acting in partnership with{" "}
                <strong>Children&apos;s Heaven Trust</strong> (Reg.
                iv-98/2021). Goodverse Foundation is a
                Bangladesh-registered organization with its
                registered address at Ta 135/B, Gulshan Badda Link
                Road, Dhaka 1212, Bangladesh.
              </p>
            </>
          ),
        },
        {
          id: "eligibility",
          title: "2. Eligibility",
          content: (
            <>
              <p>To use OrphanGive you must be:</p>
              <LegalList
                items={[
                  "At least 18 years of age (or the age of legal majority in your jurisdiction if higher).",
                  "Authorised to make the donations you initiate (you own the payment method you use, or you have explicit permission from its owner).",
                  "Not subject to sanctions or restrictions that would prohibit you from making a charitable donation to a Bangladesh-registered organisation.",
                ]}
              />
            </>
          ),
        },
        {
          id: "account",
          title: "3. Account responsibilities",
          content: (
            <>
              <p>
                You are responsible for keeping your sign-in credentials
                secure, for keeping your contact information accurate, and
                for notifying us promptly if you suspect your account has
                been accessed without your authorisation.
              </p>
              <p>
                We may suspend or close accounts that show signs of
                fraudulent activity, that violate these terms, or that have
                been inactive for an extended period. Where account closure
                is initiated by us, we will give you reasonable notice and
                an opportunity to respond, except in cases of suspected
                fraud where immediate suspension may be necessary.
              </p>
            </>
          ),
        },
        {
          id: "donations",
          title: "4. Donations",
          content: (
            <>
              <p>
                Donations made through OrphanGive support real,
                individually-verified children in Bangladesh. Funds clear
                through Stripe into OrphanGive&apos;s operating account and
                are then transferred to Children&apos;s Heaven Trust on a
                regular cadence for on-ground delivery (schooling, clothing,
                healthcare, general care).
              </p>
              <p>
                Donations are denominated in the currency you select at
                checkout. Foreign-exchange conversion is handled by Stripe at
                rates Stripe sets; we do not add a markup.
              </p>
              <p>
                Donations are <strong>non-refundable</strong> except where
                explicitly stated in our{" "}
                <a
                  href="/refund"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  Refund Policy
                </a>
                . By donating, you acknowledge that funds may be deployed on
                the ground before any refund request can be processed.
              </p>
              <p>
                <strong>International donors and tax treatment:</strong>{" "}
                OrphanGive accepts donations from international
                donors via Stripe. Donations are processed in your
                local currency.{" "}
                <strong>
                  OrphanGive does not provide tax receipts valid in
                  jurisdictions other than Bangladesh.
                </strong>{" "}
                Whether your donation is tax-deductible in your
                country is governed by your local tax law and the
                registration status of Goodverse Foundation in your
                jurisdiction (currently registered in Bangladesh
                only). Donors should consult their local tax advisor
                before claiming any deduction.
              </p>
            </>
          ),
        },
        {
          id: "recurring",
          title: "5. Recurring sponsorship",
          content: (
            <>
              <p>
                Monthly sponsorships are recurring subscriptions managed
                through Stripe. The first payment clears at checkout;
                subsequent payments run automatically each month on the same
                calendar day, until you cancel or until the sponsorship
                otherwise ends.
              </p>
              <p>
                You can cancel a monthly sponsorship at any time from your
                donor dashboard. Cancellation stops future charges. It does
                not refund completed monthly cycles — those funds have
                already been allocated to the child. Where you have prepaid
                multiple months and unused months remain, a pro-rated refund
                may be offered at OrphanGive&apos;s discretion per the
                Refund Policy.
              </p>
            </>
          ),
        },
        {
          id: "acceptable-use",
          title: "6. Acceptable use",
          content: (
            <>
              <p>You agree not to:</p>
              <LegalList
                items={[
                  "Make donations with stolen, fraudulent, or otherwise unauthorised payment methods.",
                  "Misrepresent your identity or the source of donated funds.",
                  "Attempt to scrape, harvest, or otherwise systematically extract child profile data, photos, or donor data from the site.",
                  "Use the service to contact children, guardians, or partner field workers outside the formal reveal-request process.",
                  "Attempt to bypass the privacy tier model or access information your tier does not grant.",
                  "Interfere with the service's operation, including denial-of-service attempts, exploiting vulnerabilities, or reverse-engineering the service.",
                  "Re-publish child photos, names, or stories on third-party sites, social media, or commercial services.",
                ]}
              />
            </>
          ),
        },
        {
          id: "ip",
          title: "7. Intellectual property",
          content: (
            <>
              <p>
                The OrphanGive name, logo, and design system are trademarks
                of Goodverse Foundation. The text, photographs, illustrations,
                and other materials on this site are protected by copyright
                and are licensed to you for personal, non-commercial viewing
                only.
              </p>
              <p>
                Child photographs are made available solely to support the
                sponsorship relationship. You may not download, redistribute,
                or repurpose child photos outside that relationship without
                explicit written permission from OrphanGive and the relevant
                guardian.
              </p>
            </>
          ),
        },
        {
          id: "limitation",
          title: "8. Limitation of liability",
          content: (
            <>
              <p>
                OrphanGive operates on a best-effort basis. We work hard to
                verify every child profile, to deliver every donation as
                intended, and to maintain the service&apos;s availability —
                but we cannot and do not guarantee specific outcomes for any
                particular child, sponsorship, or donor experience.
              </p>
              <p>
                To the maximum extent permitted by applicable law,
                Goodverse Foundation and Children&apos;s Heaven Trust
                are not liable for indirect, incidental,
                consequential, or punitive damages arising out of
                your use of the service. Our aggregate liability for
                any direct loss attributable to our gross negligence
                is capped at <strong>the lower of (a)</strong> the
                total amount you have donated through the service in
                the twelve (12) months preceding the event giving
                rise to the claim, <strong>or (b) BDT 100,000</strong>.
              </p>
              <p>
                We are not liable for delays or failures caused by
                circumstances outside our reasonable control (force majeure
                events including natural disasters, banking outages, regulatory
                actions, or large-scale infrastructure failures).
              </p>
            </>
          ),
        },
        {
          id: "termination",
          title: "9. Termination",
          content: (
            <>
              <p>
                You may close your account at any time by writing to
                support@orphangive.org. Account closure stops future
                recurring charges and removes your personal data from active
                systems within 30 days (subject to the retention obligations
                described in the{" "}
                <a
                  href="/privacy#retention"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  Privacy Policy
                </a>
                ).
              </p>
              <p>
                We may suspend or terminate accounts that violate these
                terms, that engage in fraudulent activity, or that pose a
                risk to the children or other donors on the service. Where
                possible we will give you advance notice and a chance to
                respond.
              </p>
            </>
          ),
        },
        {
          id: "governing-law",
          title: "10. Governing law & disputes",
          content: (
            <>
              <p>
                These terms are governed by the laws of the People&apos;s
                Republic of Bangladesh. Any dispute arising out of or in
                connection with your use of OrphanGive will be resolved by
                the competent courts of Bangladesh.
              </p>
              <p>
                Before initiating formal proceedings, we ask that you first
                contact us at support@orphangive.org so we can attempt to
                resolve the matter directly. Most issues can be settled
                without escalation.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "11. Changes to these terms",
          content: (
            <>
              <p>
                We may amend these terms from time to time. Material changes
                will be notified to active donors by email at least 14 days
                before they take effect; non-material changes will be
                reflected by an updated &quot;Last updated&quot; date at the
                top of this page. Continued use of the service after a change
                takes effect constitutes acceptance of the revised terms.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
