// LEGAL DRAFT — Mahmud: review with Bangladesh legal counsel before
// merging to main. Do NOT publish without legal sign-off.
//
// Safeguarding is the most important legal page on a child-
// focused service. The draft below is intentionally conservative
// and avoids commitments OrphanGive may not currently be able to
// keep. Please walk through it with Children's Heaven Trust's
// designated safeguarding lead before publishing.

import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import {
  LegalPageLayout,
  LegalList,
} from "@/components/legal/LegalPageLayout";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("safeguarding");
  return {
    title: page?.title
      ? `${page.title} — OrphanGive`
      : "Safeguarding policy — OrphanGive",
    description:
      page?.meta_description ??
      "How OrphanGive and Children's Heaven Trust protect the welfare, dignity, and privacy of every child on the service.",
  };
}

export default async function SafeguardingPage() {
  const page = await getSitePage("safeguarding");

  if (page?.content) {
    return (
      <SitePageRenderer
        page={page}
        fallback={{
          title: "Safeguarding policy",
          description:
            "How OrphanGive protects the welfare, dignity, and privacy of every child on the service.",
        }}
      />
    );
  }

  return (
    <LegalPageLayout
      eyebrowText="Safeguarding policy"
      headlinePart1="Children come first."
      headlinePart2="Always."
      subCopy="OrphanGive is committed to safeguarding the welfare, dignity, and privacy of every child whose profile appears on this service. This policy describes how we and our partner organisations meet that commitment — and how anyone with a concern can raise it."
      lastUpdated="[Date TBD upon legal review]"
      closingTopic="safeguarding"
      sections={[
        {
          id: "commitment",
          title: "1. Our commitment",
          content: (
            <>
              <p>
                Every child listed on OrphanGive is a real child in
                Bangladesh, identified and verified by Children&apos;s Heaven
                Trust&apos;s field team with the informed consent of their
                guardian. Their welfare, dignity, and privacy are not
                secondary to the operation of the service — they are the
                operation of the service.
              </p>
              <p>
                We commit to the following floor:
              </p>
              <LegalList
                items={[
                  "No child is listed without documented guardian consent.",
                  "No photo is published without per-photo consent recorded against the guardian.",
                  "No identifying detail — exact address, school name, guardian name and contact, full date of birth — appears at the public tier.",
                  "Donors cannot contact children or guardians outside the formal reveal-approval flow.",
                  "Any safeguarding concern raised is investigated promptly and transparently.",
                ]}
              />
            </>
          ),
        },
        {
          id: "scope",
          title: "2. Who this policy applies to",
          content: (
            <>
              <p>This policy binds:</p>
              <LegalList
                items={[
                  "All Goodverse Foundation staff and contractors involved in operating OrphanGive.",
                  "All Children's Heaven Trust staff, field workers, and partner volunteers involved in verifying, listing, and supporting children on the service.",
                  "Any donor who has access to Tier 2 or Tier 3 child information.",
                  "Any third-party service provider that handles child data on our behalf (Stripe, Resend, Cloudinary, our hosting provider).",
                ]}
              />
              <p>
                It applies to in-person interactions, online interactions,
                written communications, photographs, and any other form of
                contact with or about children represented on OrphanGive.
              </p>
            </>
          ),
        },
        {
          id: "principles",
          title: "3. Core principles",
          content: (
            <>
              <LegalList
                items={[
                  <>
                    <strong>The child&apos;s best interest is paramount.</strong>{" "}
                    Where any decision involves a trade-off between the
                    child&apos;s welfare and any operational, financial, or
                    donor consideration, the child&apos;s welfare wins.
                  </>,
                  <>
                    <strong>Informed consent.</strong> The guardian provides
                    informed consent at listing and retains the right to
                    withdraw consent — for the listing itself, for any
                    specific photograph, or for any specific information — at
                    any time. Withdrawal is honoured within 24 hours for
                    photos and within 7 days for full listing retirement.
                  </>,
                  <>
                    <strong>Age-appropriate involvement.</strong> Where a
                    child is old enough to express a view on whether and how
                    they appear on OrphanGive, that view is sought through
                    the field team and given weight alongside the
                    guardian&apos;s.
                  </>,
                  <>
                    <strong>The three-tier privacy model is non-negotiable.</strong>{" "}
                    Public viewers, authenticated donors, and reveal-approved
                    sponsors see different amounts of information. The model
                    is not a soft preference; it is enforced at the schema
                    and access-control layer and cannot be bypassed.
                  </>,
                ]}
              />
            </>
          ),
        },
        {
          id: "verification",
          title: "4. Verification before listing",
          content: (
            <>
              <p>
                Before any child appears on OrphanGive, a Children&apos;s
                Heaven Trust field worker visits the household, meets the
                guardian, reviews supporting documents (identity, school
                enrolment, household income evidence), and confirms that
                the child meets the criteria for listing. No profile is
                published until that verification visit has been completed
                and signed off.
              </p>
              <p>
                The verification process is described in more detail on the{" "}
                <a
                  href="/how-it-works"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  How It Works
                </a>{" "}
                page.
              </p>
            </>
          ),
        },
        {
          id: "reporting",
          title: "5. Reporting a safeguarding concern",
          content: (
            <>
              <p>
                If you have a concern about the welfare, safety, or privacy
                of any child represented on OrphanGive, please report it
                immediately. Concerns may include (but are not limited to):
              </p>
              <LegalList
                items={[
                  "Suspected misuse of a child's photo or information by another donor or third party.",
                  "Inappropriate contact by anyone with access to Tier 2 or Tier 3 information.",
                  "Reason to believe a guardian has not given fully informed consent for the listing.",
                  "Reason to believe a child's circumstances have changed in a way that affects their safety or dignity.",
                  "Any concern about the conduct of a field worker, staff member, or contractor.",
                ]}
              />
              <p>
                Email{" "}
                <a
                  href="mailto:support@orphangive.org"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  support@orphangive.org
                </a>{" "}
                with subject line beginning &quot;Safeguarding:&quot;. Provide
                as much detail as you can. You may report anonymously,
                although a contact address helps us follow up if more
                information is needed.
              </p>
              <p>
                <strong>Urgent concerns:</strong> for any concern requiring
                immediate intervention (suspected abuse, immediate risk),
                please contact the local Bangladesh authorities directly in
                addition to notifying us.
              </p>
            </>
          ),
        },
        {
          id: "response",
          title: "6. What happens after a report",
          content: (
            <>
              <p>
                A safeguarding report is acknowledged within one business
                day. The designated safeguarding lead at OrphanGive
                coordinates with Children&apos;s Heaven Trust&apos;s
                designated safeguarding officer to investigate. Urgent matters
                — those involving immediate risk to a child — trigger action
                within 48 hours, including (where appropriate) immediate
                retirement of the profile from the service pending
                investigation.
              </p>
              <p>
                Where the concern involves alleged misconduct by a staff
                member, contractor, or donor, that person&apos;s access to
                the service or to relevant information is suspended for the
                duration of the investigation. Findings are documented and
                actions are taken in proportion to the finding.
              </p>
              <p>
                Where the law of Bangladesh requires us to report a concern
                to the authorities (including the Department of Social
                Services or the police), we do so. Where the law permits us
                to keep the reporter&apos;s identity confidential, we do so.
              </p>
            </>
          ),
        },
        {
          id: "training",
          title: "7. Training and accountability",
          content: (
            <>
              <p>
                Field workers involved in child verification and ongoing
                visits undergo safeguarding training as part of their
                onboarding with Children&apos;s Heaven Trust, with refresher
                sessions on a regular basis. Staff with access to Tier 2 or
                Tier 3 child data receive equivalent training before access
                is granted.
              </p>
              <p>
                Each partner organisation has a named safeguarding lead
                whose responsibility includes maintaining records of
                concerns raised, actions taken, and lessons learned. Annual
                reviews of the safeguarding policy and its implementation
                are conducted jointly by Goodverse Foundation and
                Children&apos;s Heaven Trust.
              </p>
            </>
          ),
        },
        {
          id: "child-protection",
          title: "8. Related: Child Protection Policy",
          content: (
            <>
              <p>
                A more detailed Child Protection Policy — covering the
                operational procedures, definitions, and reporting templates
                referenced above — is maintained internally by
                Children&apos;s Heaven Trust. A copy can be provided on
                request to verified press, regulatory bodies, partner
                organisations considering a tenant relationship, and donors
                with a substantiated interest.
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
                This policy operates within the framework of the laws of
                the People&apos;s Republic of Bangladesh, in particular the{" "}
                <strong>Children Act 2013</strong>, which sets out the
                rights of children and the obligations of those who work
                with them, and the relevant provisions of the{" "}
                <strong>Digital Security Act 2018</strong> with respect to
                the handling of children&apos;s personal data.
              </p>
              <p>
                Where this policy and applicable Bangladesh law diverge in
                any specific case, the law of Bangladesh prevails.
              </p>
            </>
          ),
        },
        {
          id: "updates",
          title: "10. Updates to this policy",
          content: (
            <>
              <p>
                This policy is reviewed and updated at least annually, or
                sooner where operational changes, incidents, or regulatory
                changes require it. The current version is always available
                on this page; the &quot;Last updated&quot; date at the top
                reflects the most recent revision.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
