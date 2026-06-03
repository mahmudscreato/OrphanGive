// /cookies — Cookie Policy, rendered through the shared LegalPageLayout so it
// carries the same design language as /privacy: dual-font hero, "last updated"
// chip, table of contents with anchor links, id-anchored sections, closing
// strip → /contact, and print styles.
//
// CMS escape hatch: if a published `site_page` row with slug "cookies" has a
// non-empty `content` field, that CMS copy renders instead of the hardcoded
// content below (same pattern as the other legal pages). The hardcoded content
// below is the publish-ready source of truth.
//
// The "Managing cookies" section embeds <ConsentControls/> — the live
// withdraw / change-analytics-consent control.

import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import { ConsentControls } from "@/components/analytics/ConsentControls";
import {
  LegalPageLayout,
  LegalList,
} from "@/components/legal/LegalPageLayout";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("cookies");
  return {
    title: page?.title ? `${page.title} — OrphanGive` : "Cookie policy — OrphanGive",
    description:
      page?.meta_description ??
      "How OrphanGive uses cookies: essential cookies to run the service, a small preference cookie, and Google Analytics only with your consent. No advertising cookies, no cross-site tracking.",
  };
}

// "Cookies at a glance" table data (PART 1). Rendered as a styled, responsive
// table below — tangerine header, ink text, white/cream zebra rows.
const GLANCE_COLS = ["Cookie", "Provider", "Purpose", "Type", "Duration"];
const GLANCE_ROWS: string[][] = [
  ["Authentication cookie", "OrphanGive", "Keeps signed-in users logged in", "Essential", "A few weeks"],
  ["Session / cart cookie", "OrphanGive", "Maintains cart and session state", "Essential", "Browser session"],
  ["Security cookie", "OrphanGive", "Protects forms and accounts from forgery", "Essential", "Session or short period"],
  ["Analytics-preference cookie", "OrphanGive", "Remembers your analytics accept/decline choice", "Preference", "6–12 months"],
  ["_ga and related", "Google Analytics", "Anonymous usage analytics, only after you consent", "Analytics", "Up to 2 years"],
];

function CookiesAtAGlanceTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink/10 print:overflow-visible print:border-black/30">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">Cookies at a glance</caption>
        <thead>
          <tr className="bg-tangerine text-ink print:bg-white print:text-black">
            {GLANCE_COLS.map((col) => (
              <th
                key={col}
                scope="col"
                className="border-b border-ink/10 px-4 py-3 font-semibold print:border-black/30"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GLANCE_ROWS.map((row, ri) => (
            <tr key={ri} className={`${ri % 2 ? "bg-cream" : "bg-white"} print:bg-white`}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`border-b border-ink/[0.06] px-4 py-3 align-top print:border-black/20 print:text-black ${
                    ci === 0 ? "font-medium text-ink" : "text-ink-soft"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CookiesPage() {
  const page = await getSitePage("cookies");

  if (page?.content) {
    return (
      <SitePageRenderer
        page={page}
        fallback={{
          title: "Cookie policy",
          description: "How OrphanGive uses cookies.",
        }}
      />
    );
  }

  return (
    <LegalPageLayout
      eyebrowText="Cookie Policy"
      headlinePart1="Used with care."
      headlinePart2="And your choice."
      subCopy="Cookies are small files that help a website remember basic information, such as whether you are signed in, what you have placed in your sponsorship cart, or whether you have accepted or declined analytics."
      lastUpdated="3 June 2026"
      closingTopic="cookies"
      sections={[
        {
          id: "at-a-glance",
          title: "1. Cookies at a glance",
          content: (
            <>
              <p>
                OrphanGive uses cookies carefully and only for limited purposes.
                We use essential cookies to make the service work, a small
                preference cookie to remember your analytics choice, and
                analytics cookies only if you choose to allow them. We do not use
                advertising cookies, third-party tracking pixels, or cookies that
                track you for marketing across other websites. We do not sell or
                share cookie data with marketers.
              </p>
              <CookiesAtAGlanceTable />
            </>
          ),
        },
        {
          id: "cookies-we-use",
          title: "2. The cookies we use",
          content: (
            <>
              <p>
                Most of the cookies we set are essential — necessary for the
                service to function. Essential cookies are exempt from explicit
                consent requirements under most privacy frameworks because the
                service cannot operate without them. We also set one small
                preference cookie to remember your analytics choice, and — only
                with your consent — analytics cookies (described in
                &ldquo;Analytics, and your choice&rdquo; below).
              </p>
              <p>
                <strong>Authentication cookies.</strong> When you sign in to
                OrphanGive, we set a cookie that identifies you as a signed-in
                user on subsequent requests. Without this cookie, you would need
                to enter your password on every single page. This cookie
                typically lasts for a few weeks and is renewed each time you
                visit. It is removed when you sign out or when it expires.
              </p>
              <p>
                <strong>Session cookies.</strong> While you are using OrphanGive,
                certain temporary cookies hold information that needs to persist
                across the few seconds between page loads — for instance, what
                you have placed in your sponsorship cart before checking out.
                These cookies are deleted automatically when you close your
                browser.
              </p>
              <p>
                <strong>Security cookies.</strong> Some cookies are set as
                protective measures — to verify that form submissions come from
                genuine OrphanGive pages rather than from external attackers
                attempting to forge requests on your behalf. These cookies are
                essential for the security of your account and your sponsorship.
              </p>
              <p>
                <strong>Analytics-preference cookie.</strong> A small cookie that
                remembers whether you accepted or declined analytics, so we do
                not ask you again on every visit. It is set as soon as you make a
                choice — accept or decline — and it contains only that
                preference. It does not track you, and it is not shared with
                anyone.
              </p>
            </>
          ),
        },
        {
          id: "analytics-and-your-choice",
          title: "3. Analytics, and your choice",
          content: (
            <>
              <p>
                OrphanGive uses Google Analytics 4 only with your consent to
                collect privacy-protective usage statistics, such as how many
                people visit a page and which content appears useful. We do not
                use analytics to identify you, and we do not link analytics data
                to donor accounts, child records, sponsorship records, field-team
                accounts, or administrator accounts.
              </p>
              <p>
                <strong>
                  This is entirely your choice, and it is switched off until you
                  turn it on.
                </strong>{" "}
                When you first visit OrphanGive, you are asked whether you wish to
                allow analytics. If you decline, or simply ignore the request, no
                analytics runs: no Google Analytics script loads, no analytics
                cookie is placed, and no data is sent. Declining is as
                straightforward as accepting.
              </p>
              <p>
                If you do allow analytics, you can change your mind at any time.
                Use the control at the bottom of this page to withdraw your
                consent. If you withdraw consent, analytics will stop on future
                page views. Where technically possible, we will also remove or
                expire analytics cookies previously set by OrphanGive.
              </p>
              <p>
                <strong>
                  We protect the children in our care even within analytics.
                </strong>{" "}
                Before any information is sent to Google, we remove anything that
                could identify a child or an individual:
              </p>
              <LegalList
                items={[
                  <>
                    <strong>A child&apos;s name is never sent.</strong> On pages
                    that would otherwise carry a child&apos;s name, we replace the
                    page title with a generic label before any data leaves your
                    browser.
                  </>,
                  <>
                    <strong>Internal reference numbers are removed.</strong> The
                    unique identifiers we use internally for children, donors, and
                    sponsorships are stripped out and replaced with a placeholder.
                  </>,
                  <>
                    <strong>Web-address detail is trimmed.</strong> Anything after
                    a &ldquo;?&rdquo; or &ldquo;#&rdquo; in a web address is
                    removed before sending.
                  </>,
                  <>
                    <strong>IP addresses are anonymised.</strong>
                  </>,
                ]}
              />
              <p>
                Analytics is never run on the parts of OrphanGive used by
                signed-in donors, by our field team, or by our administrators.
              </p>
              <p>
                The analytics cookie set after you accept (named for Google
                Analytics, beginning &ldquo;_ga&rdquo;) lasts up to two years. You
                can clear it at any time through your browser, or by withdrawing
                consent using the control at the bottom of this page.
              </p>
            </>
          ),
        },
        {
          id: "what-we-dont-use",
          title: "4. What we do not use",
          content: (
            <>
              <p>We do not use:</p>
              <LegalList
                items={[
                  <>
                    <strong>Advertising cookies:</strong> we do not show ads on
                    OrphanGive, and we do not place cookies that track you for
                    advertising purposes elsewhere on the web.
                  </>,
                  <>
                    <strong>Third-party tracking pixels:</strong> no Facebook
                    pixel, no Google Ads conversion tracking, no LinkedIn insight
                    tag, no other behavioural advertising technology.
                  </>,
                  <>
                    <strong>Cross-site fingerprinting:</strong> we do not build a
                    fingerprint of your browser, device, or behaviour to identify
                    you across sessions or other websites.
                  </>,
                  <>
                    <strong>Analytics that identify you:</strong> the analytics
                    described above is privacy-protective and consent-based. We do
                    not link analytics data to your identity, and we do not sell
                    or share it with data brokers or marketers.
                  </>,
                ]}
              />
            </>
          ),
        },
        {
          id: "third-party",
          title: "5. Third-party services and their cookies",
          content: (
            <>
              <p>
                Some parts of OrphanGive rely on third-party services that may
                set their own cookies or process data:
              </p>
              <p>
                <strong>Stripe.</strong> Our payment processor. Stripe sets
                cookies to handle fraud detection, to remember saved payment
                methods within their secure system, and to provide their own
                checkout experience. Stripe&apos;s cookies are governed by
                Stripe&apos;s privacy policy.
              </p>
              <p>
                <strong>Resend.</strong> Our transactional email delivery partner.
                Resend does not set cookies in your browser through this website.
                Resend may record whether emails we send are opened or their links
                clicked, via small markers in those emails.
              </p>
              <p>
                <strong>Google Analytics.</strong> Used only as described in
                &ldquo;Analytics, and your choice&rdquo; above, and only after you
                accept. When active, Google processes the privacy-protective,
                redacted usage data we send, in accordance with Google&apos;s own
                terms. No analytics data is sent unless you have given consent.
              </p>
            </>
          ),
        },
        {
          id: "managing-cookies",
          title: "6. Managing cookies",
          content: (
            <>
              <p>You are always in control of cookies. You can:</p>
              <LegalList
                items={[
                  <>
                    <strong>Withdraw or change your analytics choice</strong> at
                    any time using the control below.
                  </>,
                  <>
                    <strong>Clear cookies</strong> through your browser settings,
                    which removes the analytics-preference cookie, the analytics
                    cookie, and (if you are signed in) your authentication
                    cookie — you would then be asked about analytics again, and
                    asked to sign in again.
                  </>,
                  <>
                    <strong>Block cookies</strong> in your browser. Essential
                    cookies cannot be blocked without affecting whether the
                    service works — for example, you may be unable to stay signed
                    in or complete a sponsorship.
                  </>,
                ]}
              />
              <ConsentControls />
            </>
          ),
        },
        {
          id: "international",
          title: "7. International services",
          content: (
            <>
              <p>
                Some of our service providers, including Google Analytics, Stripe,
                and Resend, may process data outside Bangladesh. Where this
                happens, we use these services only for the purposes described in
                this policy and our{" "}
                <a
                  href="/privacy"
                  className="font-medium text-tangerine-deep underline-offset-4 hover:underline"
                >
                  Privacy Policy
                </a>
                , and we expect them to protect data according to their own
                privacy, security, and contractual obligations.
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
                We may update this Cookie Policy from time to time as the service
                changes. When we make a meaningful change — such as introducing a
                new category of cookie — we will update this page and the
                &ldquo;last updated&rdquo; date above. Significant changes
                affecting analytics or tracking will, where required, be reflected
                in the consent choice presented to you.
              </p>
            </>
          ),
        },
        {
          id: "contact",
          title: "9. Contact",
          content: (
            <>
              <p>
                If you have questions about how OrphanGive uses cookies, or wish
                to exercise any of your rights, please contact us through the
                details on our{" "}
                <a
                  href="/contact"
                  className="font-medium text-tangerine-deep underline-offset-4 hover:underline"
                >
                  Contact page
                </a>
                . OrphanGive is operated by Goodverse Foundation in partnership
                with Children&apos;s Heaven Trust (Reg. iv-98/2021). For the
                purposes of this Cookie Policy, Goodverse Foundation is
                responsible for the operation of the website and the use of
                cookies on OrphanGive, unless otherwise stated.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
