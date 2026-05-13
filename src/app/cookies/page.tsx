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
      subCopy="OrphanGive uses a small number of cookies — only those required to keep you signed in, to process your donation safely, and to defend against common web attacks. No advertising trackers, no analytics scripts, no third-party data brokers."
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
          id: "what-we-dont",
          title: "3. What we don't use",
          content: (
            <>
              <p>OrphanGive does NOT use:</p>
              <LegalList
                items={[
                  "Third-party advertising cookies or remarketing pixels.",
                  "Web-analytics scripts such as Google Analytics, Mixpanel, Hotjar, or similar.",
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
          title: "4. Third-party cookies set during payment",
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
          title: "5. Managing cookies",
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
          title: "6. Updates to this policy",
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
