// Counsel-reviewed: Bangladesh legal counsel reviewed and updated 2026-05-13.
// Any further changes should be reviewed before publication.
//
// Session 26 — drafted privacy policy with CMS escape hatch. If a
// published row exists in the Directus `site_page` collection with
// slug='privacy' AND a non-empty `content` field, the CMS version
// renders (legal can edit copy without a code commit). Otherwise
// the hardcoded counsel-reviewed version below renders.

import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import {
  LegalPageLayout,
  LegalList,
} from "@/components/legal/LegalPageLayout";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("privacy");
  return {
    title: page?.title ? `${page.title} — OrphanGive` : "Privacy policy — OrphanGive",
    description:
      page?.meta_description ??
      "How OrphanGive collects, uses, and protects donor and child data. Operated by Children's Heaven Trust (Reg. iv-98/2021), Bangladesh.",
  };
}

export default async function PrivacyPage() {
  const page = await getSitePage("privacy");

  // CMS override: published row with content wins. Hardcoded draft
  // below is the fallback when no CMS content has been authored yet.
  if (page?.content) {
    return (
      <SitePageRenderer
        page={page}
        fallback={{
          title: "Privacy policy",
          description:
            "How OrphanGive collects, uses, and protects donor and child data.",
        }}
      />
    );
  }

  return (
    <LegalPageLayout
      eyebrowText="Privacy policy"
      headlinePart1="How we protect your data."
      headlinePart2="And theirs."
      subCopy="OrphanGive holds donor information and child profiles with care. This policy explains what we collect, why we collect it, who we share it with, and the rights you and the guardians of children on this site retain over that information."
      lastUpdated="13 May 2026"
      closingTopic="privacy"
      sections={[
        {
          id: "who-we-are",
          title: "1. Who we are",
          content: (
            <>
              <p>
                OrphanGive is a child-sponsorship service operated by{" "}
                <strong>Goodverse Foundation</strong>, a
                Bangladesh-registered organization (registered
                address: Ta 135/B, Gulshan Badda Link Road, Dhaka
                1212, Bangladesh), in partnership with{" "}
                <strong>Children&apos;s Heaven Trust</strong> (NGO
                Affairs Bureau registration: Reg. iv-98/2021).
                Goodverse Foundation is the operating entity that
                holds donor data and runs the donor-facing service;
                Children&apos;s Heaven Trust performs ground
                verification of every listed child.
              </p>
              {/* TODO: Goodverse Foundation statutory registration
                  number — to be added before final publication. */}
              <p>
                For the purposes of this policy, &quot;we,&quot; &quot;us,&quot;
                and &quot;OrphanGive&quot; refer to Goodverse Foundation acting
                as the data controller for donor information and as a joint
                custodian (alongside Children&apos;s Heaven Trust) for child
                profile data.
              </p>
            </>
          ),
        },
        {
          id: "what-we-collect",
          title: "2. What data we collect",
          content: (
            <>
              <p>
                <strong>From donors:</strong> name, email address, postal
                country, phone number (optional), profile photo (optional),
                sign-in credentials (email + password hash; password itself is
                never stored in plain text and is salted-and-hashed by our
                authentication system), payment-method metadata (last 4 digits
                of card, expiry, brand — never the full PAN), Stripe customer
                identifier, donation history, sponsorship history, reveal-
                request history.
              </p>
              <p>
                <strong>From children listed on the site:</strong> display
                name, date of birth (used to compute age), Bangladesh division
                and district, gender, photo (only with documented guardian
                consent), schooling and household information collected by
                Children&apos;s Heaven Trust&apos;s field team. Sensitive
                fields (exact address, school name, guardian name + contact,
                full date of birth) are encrypted at rest and never appear in
                the public surface.
              </p>
              <p>
                <strong>Automatic:</strong> IP address (recorded transiently in
                server logs for security and rate-limiting), browser user-agent
                string, referring page. We do not use tracking pixels, ad
                cookies, or third-party analytics scripts.
              </p>
            </>
          ),
        },
        {
          id: "how-we-use-it",
          title: "3. How we use it",
          content: (
            <>
              <p>We use donor data to:</p>
              <LegalList
                items={[
                  "Match donors to verified children awaiting sponsorship.",
                  "Process donations and recurring sponsorship charges via Stripe.",
                  "Send transactional emails (welcome, receipts, sponsorship updates, quarterly reports, password resets).",
                  "Surface your sponsorship history and donor dashboard.",
                  "Detect and prevent fraudulent charges or account abuse.",
                  "Issue receipts for tax purposes through Children's Heaven Trust where applicable.",
                ]}
              />
              <p>
                We use child profile data exclusively to facilitate
                sponsorship matching, on-ground delivery of support, and
                quarterly reporting to the sponsoring donor. Child data is
                never used for marketing, never sold, and never shared with
                parties outside the verification + delivery flow.
              </p>
            </>
          ),
        },
        {
          id: "tiered-privacy",
          title: "4. The three-tier privacy model",
          content: (
            <>
              <p>
                Child profile data is gated by donor tier. Each tier exists
                because the next one would compromise the child if it were
                public.
              </p>
              <LegalList
                items={[
                  <>
                    <strong>Tier 1 — public, no sign-in:</strong> display
                    name, Bangladesh division, age in years, support need,
                    consented photo.
                  </>,
                  <>
                    <strong>Tier 2 — authenticated donors:</strong> a richer
                    profile (additional consented photos, sponsorship history,
                    sponsor-queue state, broader narrative).
                  </>,
                  <>
                    <strong>Tier 3 — sponsoring donor with approved reveal:</strong>{" "}
                    visible only after a donor sponsors a specific
                    child AND requests + receives approval to view
                    more details. Includes Tier 2 plus: more
                    detailed family situation, direct progress
                    updates from the field team, and approved
                    photographs over time.
                  </>,
                ]}
              />
              <p>
                <strong>
                  Never visible to donors at any tier:
                </strong>{" "}
                the child&apos;s school name, exact home address,
                full date of birth, guardian&apos;s name and contact
                information, or precise geographic location. These
                fields are held internally for operational purposes
                only and are protected by encryption at rest.
              </p>
            </>
          ),
        },
        {
          id: "who-we-share-with",
          title: "5. Who we share data with",
          content: (
            <>
              <p>
                We share data with a limited set of service providers
                strictly necessary to operate the service:
              </p>
              <LegalList
                items={[
                  <>
                    <strong>Stripe</strong> — payment processing. Full payment-
                    card data is collected and stored by Stripe; we receive
                    only tokenised references.
                  </>,
                  <>
                    <strong>Resend</strong> — transactional email delivery.
                    Donor names and email addresses are passed to Resend for
                    the limited purpose of email send.
                  </>,
                  <>
                    <strong>Cloudinary</strong> — image hosting for child
                    photos and brand assets. Photos are served with a
                    watermark to discourage unauthorised reuse.
                  </>,
                  <>
                    <strong>Children&apos;s Heaven Trust</strong> — our field
                    partner. CH Trust receives the donor name and sponsorship
                    amount tagged to each child, so that ground delivery can
                    be attributed correctly.
                  </>,
                  <>
                    <strong>Directus</strong> — our self-hosted content and
                    user management backend. Directus is operated by Goodverse
                    Foundation on a private server; no third party has access
                    to it.
                  </>,
                ]}
              />
              <p>
                We do <strong>not</strong> sell donor or child data, do
                <strong> not</strong> share data with advertisers, data brokers,
                or social media platforms, and do <strong>not</strong>{" "}
                participate in cross-site tracking networks.
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "6. Cookies",
          content: (
            <>
              <p>
                We use a small number of strictly-necessary cookies for sign-
                in, session continuity, and protection against cross-site
                request forgery. Stripe sets its own cookies during the
                checkout flow for fraud prevention. We do not use third-party
                advertising cookies, tracking pixels, or web-analytics
                scripts.
              </p>
              <p>
                For details, see the{" "}
                <a
                  href="/cookies"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  Cookie Policy
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "7. Data retention",
          content: (
            <>
              <p>
                <strong>Donor account data:</strong> retained while the
                account is active. On account closure, personal data is
                deleted within 30 days. Donation transaction records and
                receipts are retained for at least seven (7) years in
                aggregate form to satisfy tax-record and audit obligations
                applicable to Children&apos;s Heaven Trust as a registered
                charity in Bangladesh.
              </p>
              <p>
                <strong>Child profile data:</strong> retained for as long as
                the guardian&apos;s consent remains in force and the child
                continues to be supported. If a guardian withdraws consent or
                a child&apos;s circumstances change such that listing is no
                longer appropriate, the profile is retired and identifying
                information removed within 30 days. Aggregate sponsorship
                records are retained for the same seven-year period above.
              </p>
            </>
          ),
        },
        {
          id: "your-rights",
          title: "8. Your rights",
          content: (
            <>
              <p>
                You have the right to request a copy of the personal data we
                hold about you, the right to correct inaccurate data, and the
                right to request deletion of your data subject to the
                retention obligations described above. To exercise any of
                these rights, write to{" "}
                <a
                  href="mailto:support@orphangive.org"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  support@orphangive.org
                </a>{" "}
                from the email address associated with your account.
              </p>
              <p>
                For child data, requests should originate from the
                guardian-of-record and are handled jointly by OrphanGive and
                Children&apos;s Heaven Trust.
              </p>
            </>
          ),
        },
        {
          id: "bangladesh-law",
          title: "9. Bangladesh law",
          content: (
            <>
              <p>
                OrphanGive operates under the laws of the People&apos;s
                Republic of Bangladesh. Where applicable we observe{" "}
                <strong>
                  applicable Bangladesh law including the Cyber Security
                  Ordinance, 2025
                </strong>{" "}
                with respect to personal-data handling, and the
                protections available under the{" "}
                <strong>Children Act, 2013</strong> with respect to
                child welfare and identifying information.
              </p>
              <p>
                This policy is not framed by, and does not claim compliance
                with, the EU General Data Protection Regulation (GDPR), the
                California Consumer Privacy Act (CCPA), or other foreign
                frameworks. Donors based in those jurisdictions may have
                additional rights under their local law that we cannot
                guarantee through this Bangladesh-operated service.
              </p>
            </>
          ),
        },
        {
          id: "children",
          title: "10. Children's data protections",
          content: (
            <>
              <p>
                Child profile data carries heightened protection:
              </p>
              <LegalList
                items={[
                  "No child is listed on the public surface without their guardian's documented consent.",
                  "Photo consent is recorded per-photo and can be withdrawn at any time; the photo is removed within 24 hours of withdrawal.",
                  "Identifying details (exact address, school name, guardian name and contact) are encrypted at rest and never appear at Tier 1 or Tier 2.",
                  "Child data is never used for marketing, fundraising appeals to non-sponsoring donors, or any commercial purpose.",
                  "Child data is never sold or shared with parties outside the OrphanGive + Children's Heaven Trust delivery flow.",
                ]}
              />
              <p>
                OrphanGive does not knowingly process the personal data of
                anyone under 18 as a donor. If we become aware that a donor
                account has been created by someone under 18, the account is
                closed and any data deleted in accordance with section 7.
              </p>
            </>
          ),
        },
        {
          id: "updates",
          title: "11. Updates to this policy",
          content: (
            <>
              <p>
                We may amend this policy from time to time. Material changes
                (those that meaningfully alter how data is collected, used,
                or shared) will be notified to active donors by email at
                least 14 days before the change takes effect. Non-material
                changes will be reflected by an updated &quot;Last updated&quot;
                date at the top of this page.
              </p>
            </>
          ),
        },
        {
          id: "contact",
          title: "12. Contact us",
          content: (
            <>
              <p>
                For privacy-related questions, requests under section 8, or
                to report a privacy concern, write to{" "}
                <a
                  href="mailto:support@orphangive.org"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  support@orphangive.org
                </a>
                . For child-welfare concerns specifically, please use the
                Safeguarding channel described in our{" "}
                <a
                  href="/safeguarding"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  Safeguarding Policy
                </a>
                .
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
