// MERGED 3 June 2026 — this page is the UNION of two prior sources, assembled
// verbatim (selection + ordering only, no new policy sentences authored):
//   (a) the previously-published Directus CMS row (slug "safeguarding"), and
//   (b) the prior hardcoded LegalPageLayout version (counsel-reviewed 2026-05-13).
// The ONLY text change is contact-address consolidation: the safeguarding-team
// address and the designated lead's personal mailbox were both routed to
// support@orphangive.org per founder decision. The named designated lead
// (Sarmin Sultana) is retained; her personal address is not.
//
// Each section is tagged in the ship report as CMS / hardcoded / both. One
// CONFLICT is flagged inline below (acknowledgement timeframe).
//
// Safeguarding is the most important legal page on a child-focused service.
// PENDING re-review by Bangladesh counsel + Children's Heaven Trust's
// designated safeguarding lead (Sarmin Sultana) before publication.

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

const SUPPORT_LINK_CLS =
  "text-tangerine-deep underline-offset-4 hover:underline font-medium";

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
      lastUpdated="3 June 2026"
      closingTopic="safeguarding"
      sections={[
        {
          // [BOTH] CMS "Our highest commitment" + hardcoded "Our commitment"
          id: "commitment",
          title: "1. Our commitment",
          content: (
            <>
              <p>
                The children who appear on OrphanGive are real children, in real
                circumstances, with real vulnerabilities. They are minors. Many
                have lost one or both parents. Some have experienced trauma. All
                of them deserve to be cared for, protected, and treated with the
                dignity that any child deserves &mdash; and more.
              </p>
              <p>
                Our safeguarding policy is not a legal disclaimer. It is the
                framework by which we judge every decision we make. When in
                doubt, we choose the child&apos;s safety over the sponsor&apos;s
                convenience. Always.
              </p>
              <p>
                Every child listed on OrphanGive is a real child in Bangladesh,
                identified and verified by Children&apos;s Heaven Trust&apos;s
                field team with the informed consent of their guardian. Their
                welfare, dignity, and privacy are not secondary to the operation
                of the service — they are the operation of the service.
              </p>
              <p>We commit to the following floor:</p>
              <LegalList
                items={[
                  "No child is listed without documented guardian consent.",
                  "No photo is published without per-photo consent recorded against the guardian.",
                  "No identifying detail — exact address, school name, guardian name and contact, full date of birth — appears at the public tier.",
                  "Donors cannot contact children or guardians directly. Reveal approval only unlocks limited additional progress information through OrphanGive — never contact details, and we never broker direct contact.",
                  "Any safeguarding concern raised is investigated promptly and transparently.",
                ]}
              />
              <p>
                This page explains our specific commitments, the systems we have
                in place to honour them, and what you should do if you have a
                concern about any child you encounter through our service.
              </p>
            </>
          ),
        },
        {
          // [CMS] "What safeguarding means here"
          id: "meaning",
          title: "2. What safeguarding means here",
          content: (
            <>
              <p>
                Safeguarding is the term used by child protection professionals
                worldwide to describe the proactive measures an organisation
                takes to prevent harm to children in its care. It is broader than
                reacting to abuse after it occurs. It is the architecture of
                safety we build before harm has any chance to happen.
              </p>
              <p>For OrphanGive, safeguarding covers:</p>
              <LegalList
                items={[
                  "The vetting and ongoing supervision of our partner orphanages",
                  "The verification and registration of every child profile we publish",
                  "The boundaries we place on what information sponsors can access and when",
                  "The training and accountability of staff and volunteers who interact with children",
                  "The reporting channels through which concerns can be raised and resolved",
                  "The legal and procedural frameworks under which we cooperate with authorities when serious matters arise",
                ]}
              />
            </>
          ),
        },
        {
          // [HARDCODED] "Who this policy applies to"
          id: "scope",
          title: "3. Who this policy applies to",
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
          // [HARDCODED] "Core principles"
          id: "principles",
          title: "4. Core principles",
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
          // [CMS] "Partner orphanage standards"
          id: "partner-orphanages",
          title: "5. Partner orphanage standards",
          content: (
            <>
              <p>
                OrphanGive does not directly operate orphanages. We partner with
                established orphanages in Bangladesh that have themselves been
                registered with the relevant Bangladeshi authorities, including
                the Social Welfare Department where applicable.
              </p>
              <p>Before any partner orphanage is listed on OrphanGive, we verify:</p>
              <LegalList
                items={[
                  "Their registration documents and operating licenses",
                  "The leadership and governance of the organisation",
                  "Their existing safeguarding policies and staff training records",
                  "Their accountability to local authorities and to the children they serve",
                  "Their willingness to comply with our additional safeguarding requirements",
                ]}
              />
              <p>
                We conduct site visits before partnering and we maintain ongoing
                oversight through quarterly check-ins, annual deeper reviews, and
                unannounced visits where appropriate. Partner orphanages that
                fail to maintain standards have their partnership suspended
                pending remediation, or terminated where the failures are severe.
              </p>
            </>
          ),
        },
        {
          // [BOTH] hardcoded "Verification before listing" + CMS "Child profile verification"
          id: "verification",
          title: "6. Verification before listing",
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
                <a href="/how-it-works" className={SUPPORT_LINK_CLS}>
                  How It Works
                </a>{" "}
                page.
              </p>
              <p>
                Every child listed on OrphanGive has been verified by our field
                team, not just submitted by an orphanage. Verification includes:
              </p>
              <LegalList
                items={[
                  "Confirmation of the child's identity and date of birth through official documents where available",
                  "Confirmation that the child is in the lawful care of the registering orphanage or guardian",
                  "Confirmation of orphan status — at minimum, the loss of one parent, with appropriate documentation",
                  "Consent from the child's legal guardian for the child's photograph and basic information to be shared with prospective sponsors",
                  "The child's own assent, where the child is of an age to understand and give it",
                ]}
              />
              <p>
                We do not list children whose identity, status, or consent
                cannot be verified. Where doubt exists, the child is not listed.
              </p>
            </>
          ),
        },
        {
          // [CMS] "Information boundaries"
          id: "information-boundaries",
          title: "7. Information boundaries",
          content: (
            <>
              <p>
                We publish on OrphanGive&apos;s public pages only what is
                necessary for a prospective sponsor to begin a relationship:
              </p>
              <LegalList
                items={[
                  "The child's first name (sometimes a chosen name rather than a legal name, for privacy)",
                  "A general district or region within Bangladesh (never a specific address)",
                  "The child's approximate age",
                  "A photograph cleared by the child's guardian and reviewed by our team for safety",
                ]}
              />
              <p>We never publish on the public site:</p>
              <LegalList
                items={[
                  "The child's full legal name",
                  "The child's exact address or specific school name",
                  "Identifying details of family members",
                  "Medical information",
                  "School reports or grades",
                  "The child's handwritten letters or detailed personal stories",
                ]}
              />
              <p>
                These additional details are made available only to active
                sponsors of that specific child, and only after a formal reveal
                request is approved by our team. Reveal-controlled information is
                shared on a need-to-know basis and expires after ninety days,
                after which a fresh reveal request is required.
              </p>
              <p>
                If a sponsor&apos;s relationship with a child ends &mdash;
                through cancellation, refund, or natural completion &mdash; their
                access to that child&apos;s reveal-controlled information is
                immediately revoked.
              </p>
            </>
          ),
        },
        {
          // [CMS] "What sponsors may not do"
          id: "sponsor-conduct",
          title: "8. What sponsors may not do",
          content: (
            <>
              <p>Sponsors using OrphanGive agree not to:</p>
              <LegalList
                items={[
                  "Attempt to contact a sponsored child directly outside the channels we provide",
                  "Travel to the child's location to meet them without our prior coordination and the orphanage's approval",
                  "Photograph, film, or record any communication with a sponsored child for any purpose",
                  "Republish, distribute, or commercially exploit any content shared with them through a sponsorship — including child photographs, names, stories, or letters",
                  "Use information learned through sponsorship to attempt to identify, locate, or contact the child through other channels (social media, school records, public databases)",
                  "Engage in any communication with a child that is romantic, sexual, manipulative, financially exploitative, or otherwise inappropriate",
                ]}
              />
              <p>
                Violation of any of these will result in immediate termination of
                the sponsorship, refund of pending payments, permanent ban from
                our service, and where the conduct is criminal, notification of
                Bangladeshi authorities.
              </p>
            </>
          ),
        },
        {
          // [BOTH] hardcoded "Reporting a safeguarding concern" + CMS "How to report a concern"
          id: "reporting",
          title: "9. Reporting a safeguarding concern",
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
                  "Anything in a child's communication that suggests they are being mistreated, neglected, or abused.",
                  "Inappropriate behaviour by anyone associated with our service or our partner orphanages.",
                  "Suspicions about another sponsor's conduct or intent.",
                  "Concerns about the welfare or safety of a child you encounter in any way through OrphanGive.",
                ]}
              />
              <p>
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:support@orphangive.org?subject=Safeguarding%20concern"
                  className={SUPPORT_LINK_CLS}
                >
                  support@orphangive.org
                </a>{" "}
                (with &quot;Safeguarding concern&quot; in the subject
                line). Provide as much detail as you can. You may
                report anonymously, although a contact address helps
                us follow up if more information is needed.
              </p>
              <p>
                <strong>Designated safeguarding lead:</strong> Sarmin
                Sultana, Children&apos;s Heaven Trust.
              </p>
              <p>
                <strong>Urgent concerns:</strong> for any concern requiring
                immediate intervention (suspected abuse, immediate risk),
                please contact the local Bangladesh authorities directly in
                addition to notifying us.
              </p>
              {/* CONFLICT: CMS states the acknowledgement window as "within
                  twenty-four hours" (sentence below + Contact section); the
                  hardcoded "What happens after a report" section states "within
                  one business day". Both retained — founder to resolve. */}
              <p>
                We commit to acknowledging every safeguarding report within
                twenty-four hours and to investigating thoroughly. Where
                authorities should be involved, we involve them. Where
                confidentiality is needed to protect the child or the reporter,
                we maintain it absolutely.
              </p>
              <p>
                False or malicious reports waste time we owe to real concerns,
                but we would always rather investigate a sincere worry that turns
                out to be nothing than dismiss a real concern that turns out to
                be something. Err on the side of reporting.
              </p>
            </>
          ),
        },
        {
          // [HARDCODED] "What happens after a report"
          id: "after-report",
          title: "10. What happens after a report",
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
          // [BOTH] CMS "Staff and volunteer accountability" + hardcoded "Training and accountability"
          id: "accountability",
          title: "11. Staff and volunteer accountability",
          content: (
            <>
              <p>
                All staff and volunteers of Children&apos;s Heaven Trust who
                interact with children &mdash; whether in person, by phone, or
                through written communication &mdash; undergo:
              </p>
              <LegalList
                items={[
                  "Background checks where possible under Bangladesh law",
                  "Safeguarding training before they begin any role involving children",
                  "Ongoing supervision by senior staff",
                  "A formal code of conduct that they sign and that we hold them to",
                ]}
              />
              <p>
                No staff member or volunteer is ever alone with a child without
                another adult present. No staff member or volunteer may
                communicate with a sponsored child outside of officially recorded
                channels. Breaches of these rules are treated as gross
                misconduct.
              </p>
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
          // [CMS] "Cooperation with authorities"
          id: "cooperation",
          title: "12. Cooperation with authorities",
          content: (
            <>
              <p>
                We cooperate fully with the Social Welfare Department of
                Bangladesh, the police, and any other relevant authority on any
                matter involving the welfare of a child. We respond promptly to
                lawful requests for information. We provide records, we
                facilitate interviews, we comply with court orders.
              </p>
              <p>
                We do not share information about a child with any party who does
                not have a legitimate role in protecting that child. Sponsors,
                journalists, researchers, and other interested parties do not
                have automatic access to child information regardless of their
                stated good intentions. Access is granted only where it serves
                the child&apos;s interests and only with appropriate consent.
              </p>
            </>
          ),
        },
        {
          // [HARDCODED] "Related: Child Protection Policy"
          id: "child-protection",
          title: "13. Related: Child Protection Policy",
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
          // [CMS] "Continuous improvement"
          id: "continuous-improvement",
          title: "14. Continuous improvement",
          content: (
            <>
              <p>
                Safeguarding is not a static policy. The understanding of child
                protection evolves; our threats evolve; the technology through
                which we operate evolves. We commit to:
              </p>
              <LegalList
                items={[
                  "Reviewing this policy at minimum annually, and more frequently as needed",
                  "Training all new staff and volunteers in our current safeguarding practice",
                  "Auditing our partner orphanages regularly",
                  "Learning from any safeguarding incident that does occur — within the limits of confidentiality — to prevent recurrence",
                  "Listening to the children themselves, where age and circumstance allow",
                ]}
              />
              <p>
                If you have a suggestion for how this policy or our safeguarding
                practice can be strengthened, we welcome it. Write to us.
              </p>
            </>
          ),
        },
        {
          // [BOTH] CMS "Governing law" + hardcoded "Bangladesh law"
          id: "bangladesh-law",
          title: "15. Governing law",
          content: (
            <>
              <p>
                This safeguarding policy is governed by the laws of Bangladesh.
                Children&apos;s Heaven Trust is registered with the NGO Affairs
                Bureau of Bangladesh under Registration No. iv-98/2021. We comply
                with Bangladesh law on child welfare, including the Children Act
                2013 (Shishu Ain, 2013) and applicable regulations of the
                Department of Social Services.
              </p>
              <p>
                We hold ourselves to international best practice on safeguarding
                regardless of jurisdiction, including the principles articulated
                by the United Nations Convention on the Rights of the Child.
              </p>
              <p>
                OrphanGive operates in compliance with applicable
                Bangladesh law, including the{" "}
                <strong>Children Act, 2013</strong> and other
                applicable child protection laws, and{" "}
                <strong>
                  applicable Bangladesh law including the Cyber Security
                  Ordinance, 2025
                </strong>{" "}
                with respect to the handling of children&apos;s
                personal data.
              </p>
              <p>
                Where this policy and applicable Bangladesh law diverge in
                any specific case, the law of Bangladesh prevails.
              </p>
            </>
          ),
        },
        {
          // [HARDCODED] "Updates to this policy"
          id: "updates",
          title: "16. Updates to this policy",
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
        {
          // [CMS] "Contact"
          id: "contact",
          title: "17. Contact",
          content: (
            <>
              <p>For any safeguarding concern, urgent or otherwise:</p>
              {/* FLAG: CMS source spells this "GoodVerse Foundation"; the rest
                  of the site uses "Goodverse Foundation". Kept verbatim —
                  founder to confirm correct casing. */}
              <p>
                <strong>Children&apos;s Heaven Trust</strong> &amp;{" "}
                <strong>GoodVerse Foundation</strong>
                <br />
                Operating OrphanGive
                <br />
                General email:{" "}
                <a
                  href="mailto:support@orphangive.org"
                  className={SUPPORT_LINK_CLS}
                >
                  support@orphangive.org
                </a>
              </p>
              <p>
                We respond to every safeguarding message within twenty-four
                hours. We treat every concern with the gravity it deserves.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
