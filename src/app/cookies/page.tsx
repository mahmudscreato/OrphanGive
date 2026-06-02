// DRAFT 2026-06-03 — analytics section REWRITTEN, PENDING re-review by
// Bangladesh legal counsel before publish. Previous version was
// counsel-reviewed 2026-05-13.
//
// Why this is a draft: the prior (counsel-reviewed) copy stated the site uses
// NO analytics / NO Google Analytics. That became false when GA4 was added
// (branch feature/ga4-consent) as a consent-gated, child-data-redacted,
// opt-in analytics tool. The sub-copy, the cookie list (§2), the new §3, and
// the "what we don't use" list (§4) below have been rewritten to describe GA4
// accurately. Walk this through counsel before publishing.
//
// NOTE: this page is CMS-overridable via getSitePage("cookies") — if a
// published `site_page` row with slug "cookies" exists, THAT renders instead
// of this hardcoded copy. Confirm the CMS copy is updated to match before
// relying on this file in production.

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
      "How OrphanGive uses cookies. Only what's strictly necessary to keep you signed in and to process your donation.",
  };
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
      eyebrowText="Cookie policy"
      headlinePart1="Strictly necessary."
      headlinePart2="Nothing else."
      subCopy="OrphanGive uses a small number of cookies. Most are strictly necessary — to keep you signed in, to process your donation safely, and to defend against common web attacks. We also use Google Analytics for anonymous usage statistics, but only if you choose to accept it: analytics is off by default and never runs without your consent. No advertising trackers, no remarketing pixels, no third-party data brokers."
      lastUpdated="13 May 2026"
      closingTopic="cookies"
      sections={[
        {
          id: "what-cookies",
          title: "1. What cookies are",
          content: (
            <>
              <p>
                A cookie is a small text file that a website stores in your
                browser. The browser sends it back to the same website on
                subsequent visits, which lets the website recognise you
                across page loads — useful for keeping you signed in,
                remembering preferences, and processing a multi-step
                checkout.
              </p>
              <p>
                Browsers also allow some cookies to be set by third parties
                whose content is embedded on a page (e.g. payment processors).
                These are called &quot;third-party&quot; cookies; we use very
                few, and only for essential purposes described below.
              </p>
            </>
          ),
        },
        {
          id: "what-we-use",
          title: "2. The cookies OrphanGive sets",
          content: (
            <>
              <p>We set the following cookies. All are strictly necessary:</p>
              <LegalList
                items={[
                  <>
                    <strong>Session / authentication.</strong> Once you sign
                    in, a short-lived encrypted token identifies your
                    session. Without this cookie you would have to sign in
                    again on every page load. The cookie is HTTP-only,
                    Secure, and SameSite=Lax.
                  </>,
                  <>
                    <strong>CSRF protection.</strong> A second token defends
                    against cross-site request forgery attacks (a hostile
                    website trying to make a donation on your behalf without
                    your knowledge). Strictly necessary for security.
                  </>,
                  <>
                    <strong>Cart / sponsorship draft.</strong> A small
                    identifier links the items you've added to your cart on
                    this device to the cart record on our servers, so you
                    don't lose your selections between sign-in and checkout.
                    Cleared on checkout or after a period of inactivity.
                  </>,
                  <>
                    <strong>UI preferences.</strong> If you collapse the
                    cancelled-sponsorships section on your dashboard or
                    dismiss an announcement banner, a small cookie remembers
                    that choice so we don't keep showing it to you.
                  </>,
                  <>
                    <strong>Analytics preference.</strong> When you accept or
                    decline analytics in the cookie banner, we store that single
                    choice in a first-party cookie
                    (<code>og_analytics_consent</code>) so we don&apos;t ask
                    again on every page. It holds only the word
                    &quot;granted&quot; or &quot;denied&quot; — nothing that
                    identifies you. This cookie is set whichever way you choose;
                    the Google Analytics cookies themselves are set only if you
                    accept (see section 3).
                  </>,
                ]}
              />
              <p>
                <strong>
                  By using OrphanGive, you acknowledge that essential
                  cookies (authentication, session management, CSRF
                  protection) are necessary for the service to
                  function and are set when you visit the site.
                  These cookies do not require separate consent
                  under applicable Bangladesh law. You may disable
                  cookies in your browser settings, but doing so
                  will prevent sign-in and donation features from
                  working.
                </strong>
              </p>
            </>
          ),
        },
        {
          id: "analytics",
          title: "3. Analytics & your choice",
          content: (
            <>
              <p>
                With your consent, OrphanGive uses{" "}
                <strong>Google Analytics 4 (GA4)</strong> to understand how
                visitors find and move through the site — which pages are read,
                on what kind of device, from which country. It is{" "}
                <strong>off by default</strong> and loads only after you choose
                &quot;Accept analytics&quot; in the cookie banner. If you
                decline, or simply ignore the banner, GA4 never loads, sets no
                cookies, and sends nothing.
              </p>
              <p>
                Because this is a child-protection service, we redact analytics
                data before it ever reaches Google. We never send:
              </p>
              <LegalList
                items={[
                  "A child's name. Pages that show a child or a sponsorship are reported to analytics under a generic title (“Child profile — OrphanGive”), never the child's first name.",
                  "Any identifier. Child, donor, and sponsorship ids in the page address are replaced with “[id]” before the page view is recorded.",
                  "Query-string values. Anything after “?” or “#” in the address (which can carry tokens or references) is stripped — only the cleaned path is sent.",
                ]}
              />
              <p>
                Google Analytics 4 also anonymises visitor IP addresses
                automatically and irreversibly. We do not use GA4&apos;s
                advertising, remarketing, or cross-site tracking features. When
                GA4 is active it sets its own cookies (for example
                <code> _ga</code>) to count returning visits. Analytics is never
                loaded on sign-in, donor-dashboard, or staff pages — only on the
                public pages.
              </p>
              <p className="font-medium text-ink">
                You can change your mind at any time:
              </p>
              <ConsentControls />
              <p>
                Withdrawing clears your consent and reloads the page; GA4 will
                not load again unless you accept once more.
              </p>
            </>
          ),
        },
        {
          id: "what-we-dont",
          title: "4. What we don't use",
          content: (
            <>
              <p>OrphanGive does NOT use:</p>
              <LegalList
                items={[
                  "Third-party advertising cookies or remarketing pixels.",
                  "Analytics that identify you, follow you across other websites, or build a profile of your interests. Our one analytics tool (Google Analytics 4) is consent-gated and receives only anonymous, redacted usage data — see section 3.",
                  "Social-network tracking pixels (Facebook Pixel, Twitter/X tracking, LinkedIn Insight Tag, etc.).",
                  "Cross-site identifiers shared with data brokers.",
                  "Behavioural-profiling cookies that build a model of your interests.",
                ]}
              />
              <p>
                We made these choices deliberately. Children&apos;s data and
                donor data deserve the highest privacy floor, and the simplest
                way to keep that floor high is to not collect what we don't
                need.
              </p>
            </>
          ),
        },
        {
          id: "third-party",
          title: "5. Third-party cookies set during payment",
          content: (
            <>
              <p>
                When you reach the checkout, Stripe — our payment processor —
                sets its own cookies on your browser as part of its fraud
                prevention and PCI-DSS compliance. These cookies are
                strictly necessary for processing the payment safely; without
                them Stripe cannot verify the transaction.
              </p>
              <p>
                Stripe&apos;s use of those cookies is governed by Stripe&apos;s
                own privacy policy, which you can read at{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  stripe.com/privacy
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: "manage",
          title: "6. Managing cookies",
          content: (
            <>
              <p>
                You can clear or block cookies through your browser&apos;s
                settings. If you block the cookies OrphanGive sets, you will
                not be able to sign in, complete a donation, or use the
                donor dashboard — these cookies are required for the
                service to function.
              </p>
              <p>
                For instructions specific to your browser, see your browser
                vendor&apos;s help pages (search for &quot;manage cookies
                in [browser name]&quot;).
              </p>
            </>
          ),
        },
        {
          id: "updates",
          title: "7. Updates to this policy",
          content: (
            <>
              <p>
                We may amend this policy from time to time as the service
                evolves. Material changes (those introducing a new category
                of cookie, or a new third-party cookie source) will be
                notified to active donors by email at least 14 days before
                they take effect.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
