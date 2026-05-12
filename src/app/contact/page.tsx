// Session 19 — /contact page. Tier 1 (public, no auth).
// New route — did not exist before. Server Component shell with
// the form lifted into a small client island (ContactForm.tsx).
//
// Address + phone in the contact card render as visible TODO
// markers — see the inline comments. Once Mahmud confirms the
// Goodverse Foundation Bangladesh address (and a public phone
// number, if any), they replace the placeholders directly.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { buildPageMetadata } from "@/lib/page-metadata";
import { ContactForm } from "./ContactForm";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/contact",
  title: "Contact us",
  description:
    "Sponsorship questions, technical issues, press inquiries, partnership opportunities — we respond within two business days.",
});

const SUPPORT_EMAIL = "support@orphangive.org";
// TODO: confirm with Mahmud before publish.
const PARTNERSHIPS_EMAIL = "partnerships@orphangive.org";

function MailIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export default function ContactPage() {
  return (
    <div className="bg-cream">
      {/* Page header. */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Get in touch
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              We&apos;re here.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Let&apos;s talk.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            Most messages get a response within two business days. For
            urgent issues, the support email below is the fastest
            path.
          </p>
        </div>
      </header>

      {/* Contact card + form, two columns on lg+. */}
      <section className="px-6 pb-12 max-md:pb-8">
        <div className="max-w-[1100px] mx-auto grid grid-cols-[1fr_1.4fr] max-lg:grid-cols-1 gap-10 max-lg:gap-8 items-start">
          {/* Contact card — left column. */}
          <div className="bg-white rounded-3xl px-7 py-8 max-md:px-6 max-md:py-7 border border-ink/[0.06] shadow-md space-y-6">
            <div>
              <div className="text-[12px] uppercase tracking-[0.18em] text-ink-soft mb-4 font-medium">
                Reach us directly
              </div>

              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="group flex gap-4 items-start py-3 -mx-2 px-2 rounded-xl hover:bg-cream transition-colors duration-200"
              >
                <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-pale text-tangerine-deep">
                  <MailIcon className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-0.5">
                    Email
                  </div>
                  <div className="font-display font-semibold text-base text-ink group-hover:text-tangerine-deep transition-colors">
                    {SUPPORT_EMAIL}
                  </div>
                </div>
              </a>

              {/* TODO-ADDRESS — confirm Goodverse Foundation
                  Bangladesh registered address with Mahmud before
                  publish. Currently renders as a visible TBD. */}
              <div className="flex gap-4 items-start py-3 -mx-2 px-2">
                <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-pale text-tangerine-deep">
                  <PinIcon className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-0.5">
                    Address
                  </div>
                  <div className="font-mono text-sm text-ink-soft">
                    TBD — Goodverse Foundation, Bangladesh
                  </div>
                </div>
              </div>

              {/* TODO-PHONE — confirm whether a public-facing
                  phone exists. If not, this row can be deleted. */}
              <div className="flex gap-4 items-start py-3 -mx-2 px-2">
                <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-pale text-tangerine-deep">
                  <PhoneIcon className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wider text-ink-soft font-medium mb-0.5">
                    Phone
                  </div>
                  <div className="font-mono text-sm text-ink-soft">
                    TBD
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-5 border-t border-ink/[0.08]">
              <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft mb-2 font-medium">
                Response time
              </div>
              <p className="text-sm text-ink-soft leading-[1.55]">
                Within two business days for support enquiries.
                Partnership and press messages are routed to the
                relevant team and may take a little longer.
              </p>
            </div>
          </div>

          {/* Form — right column. */}
          <div className="bg-white rounded-3xl px-8 py-8 max-md:px-6 max-md:py-7 border border-ink/[0.06] shadow-md">
            <h2 className="font-display font-semibold text-2xl text-ink mb-1">
              Send us a message
            </h2>
            <p className="text-sm text-ink-soft mb-6 leading-relaxed">
              Tell us what you&apos;re looking for and we&apos;ll get
              back to you.
            </p>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* NGO / press lane — separate small card so it's clearly
          differentiated from general contact. */}
      <section className="px-6 py-10 max-md:py-8">
        <div className="max-w-[760px] mx-auto bg-white rounded-2xl px-7 py-6 max-md:px-5 max-md:py-5 border border-ink/[0.06] shadow-sm">
          <div className="flex gap-4 items-start max-md:flex-col">
            <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-pale text-tangerine-deep">
              <MailIcon className="w-5 h-5" />
            </span>
            <div className="flex-1">
              <div className="font-display font-semibold text-lg text-ink leading-tight">
                Partnership or press?
              </div>
              <p className="mt-1 text-sm text-ink-soft leading-[1.55]">
                For NGO partnerships, charity collaborations, or media
                inquiries, reach out directly:{" "}
                <a
                  href={`mailto:${PARTNERSHIPS_EMAIL}`}
                  className="text-tangerine-deep font-medium hover:underline"
                >
                  {PARTNERSHIPS_EMAIL}
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing strip. */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            <Link
              href="/children"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Browse children waiting for sponsors →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
