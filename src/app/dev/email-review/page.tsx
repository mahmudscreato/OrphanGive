// Session 34 Part C — developer-only email review surface.
//
// Lists every transactional email template in `src/emails/` plus the
// Directus-side password-reset Liquid template. Each row has a "Send
// to mahmud@printagraphy.com" button that fires
// /api/dev/send-test-email with the template id. There's also a
// "Send ALL" button for a one-shot review pass.
//
// The page is gated by NEXT_PUBLIC_DEV_TOOLS_ENABLED. When the env
// var is unset (production default), this server component returns
// notFound() so the URL behaves like a 404 to anyone scanning.
//
// The password reset email is special — it lives in
// directus-templates/email/password-reset.liquid and is sent by
// Directus, not by Next/Resend. So we can't fire it from this page.
// Instead we render an HTML preview inline + tell Mahmud to trigger
// a real send by hitting /forgot-password against any donor account.
//
// TODO: fold into OPS_RUNBOOK.md after Session 30 merges to main —
// new section "Reviewing transactional emails" pointing here, with
// the access caveat (NEXT_PUBLIC_DEV_TOOLS_ENABLED=true required).

import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { render } from "@react-email/render";
import { EMAIL_SAMPLES } from "@/lib/dev-email-samples";
import { EmailReviewActions } from "./EmailReviewActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Match the API gate exactly — see /api/dev/send-test-email/route.ts.
function devToolsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_TOOLS_ENABLED === "true";
}

// Read the Liquid template at request time so any edit to
// directus-templates/email/password-reset.liquid shows up on the
// next refresh. We strip the {{url}} placeholder + replace it with
// a fake URL so the preview renders something realistic instead of
// literal Liquid syntax.
async function loadPasswordResetPreview(): Promise<string | null> {
  try {
    const filePath = path.join(
      process.cwd(),
      "directus-templates",
      "email",
      "password-reset.liquid",
    );
    const raw = await fs.readFile(filePath, "utf8");
    const fakeUrl = "https://orphangive.org/auth/reset?token=preview";
    return raw.replaceAll("{{url}}", fakeUrl);
  } catch {
    return null;
  }
}

export default async function EmailReviewPage() {
  if (!devToolsEnabled()) notFound();

  // Pre-render every email to HTML at request time so Mahmud can
  // see them inline without round-tripping to Resend. This is the
  // same `render()` used by sendEmail() — what he sees here is
  // exactly what arrives in the inbox (modulo email-client quirks).
  const renderedSamples = await Promise.all(
    EMAIL_SAMPLES.map(async (sample) => ({
      id: sample.id,
      title: sample.title,
      description: sample.description,
      subject: sample.subject,
      html: await render(sample.render()),
    })),
  );

  const passwordResetHtml = await loadPasswordResetPreview();

  return (
    <main className="min-h-screen bg-[#FBF1E5] py-10">
      <div className="mx-auto max-w-5xl px-6">
        {/* WARNING BANNER — make it impossible to mistake this for a
            user-facing page. Bright orange, "DEVELOPER TOOL" label.  */}
        <div className="mb-8 rounded-2xl border-2 border-[#ED8B3F] bg-[#FFF6EC] px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#ED8B3F]">
            Developer tool
          </p>
          <h1 className="mt-2 font-serif text-3xl text-[#2A2A2C]">
            Email review
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#4A4A4C]">
            Internal-only surface for previewing and test-sending every
            transactional email OrphanGive sends. Gated on{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-xs">
              NEXT_PUBLIC_DEV_TOOLS_ENABLED=true
            </code>
            . Returns 404 in production. Test sends always go to{" "}
            <strong>mahmud@printagraphy.com</strong> with a{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-xs">
              [TEST]
            </code>{" "}
            subject prefix.
          </p>
        </div>

        {/* Send ALL + per-row send buttons live in the client island
            so the server component stays static-renderable.        */}
        <EmailReviewActions
          samples={renderedSamples.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            subject: s.subject,
          }))}
        />

        <section className="mt-10 space-y-8">
          {renderedSamples.map((s) => (
            <article
              key={s.id}
              className="rounded-2xl border border-[#F0E8D9] bg-white p-6 shadow-sm"
            >
              <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-serif text-xl text-[#2A2A2C]">
                    {s.title}
                  </h2>
                  <p className="mt-1 text-sm text-[#666]">{s.description}</p>
                </div>
                <code className="rounded bg-[#FBF1E5] px-2 py-1 text-xs text-[#666]">
                  id: {s.id}
                </code>
              </header>
              <p className="mb-3 text-xs uppercase tracking-wide text-[#999]">
                Subject preview:{" "}
                <span className="font-mono normal-case text-[#4A4A4C]">
                  [TEST] {s.subject}
                </span>
              </p>
              {/* Render the email HTML inside an iframe so its inline
                  styles can't leak into the host page. Same isolation
                  technique React Email's own preview uses.          */}
              <iframe
                srcDoc={s.html}
                title={`${s.title} preview`}
                className="h-[700px] w-full rounded-xl border border-[#F0E8D9] bg-white"
                sandbox=""
              />
            </article>
          ))}

          {/* Password reset Liquid template — preview only, with a
              note about how to trigger a real send.                */}
          <article className="rounded-2xl border border-[#F0E8D9] bg-white p-6 shadow-sm">
            <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="font-serif text-xl text-[#2A2A2C]">
                  Password reset (Directus / Liquid)
                </h2>
                <p className="mt-1 text-sm text-[#666]">
                  Sent by Directus (not Next.js / Resend) when a donor
                  hits <code>/forgot-password</code>. Template lives at{" "}
                  <code>directus-templates/email/password-reset.liquid</code>.
                </p>
              </div>
              <code className="rounded bg-[#FBF1E5] px-2 py-1 text-xs text-[#666]">
                liquid
              </code>
            </header>
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No test-send button — Directus owns this email path. To
              trigger a real send, hit{" "}
              <a href="/forgot-password" className="underline">
                /forgot-password
              </a>{" "}
              with any donor account email.
            </div>
            {passwordResetHtml ? (
              <iframe
                srcDoc={passwordResetHtml}
                title="Password reset preview"
                className="h-[700px] w-full rounded-xl border border-[#F0E8D9] bg-white"
                sandbox=""
              />
            ) : (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                Could not load the Liquid template at{" "}
                <code>directus-templates/email/password-reset.liquid</code>.
                Verify the file exists in the repo.
              </p>
            )}
          </article>
        </section>

        <footer className="mt-10 rounded-2xl border border-[#F0E8D9] bg-white p-6 text-sm text-[#666]">
          <p>
            <strong>Quota note:</strong> Resend free tier is 100/day,
            2/sec. The &ldquo;Send ALL&rdquo; button paces sequentially with
            a small delay to stay under the rate limit.
          </p>
          <p className="mt-2">
            <strong>Done reviewing?</strong> Set{" "}
            <code className="rounded bg-[#FBF1E5] px-1.5 py-0.5 text-xs">
              NEXT_PUBLIC_DEV_TOOLS_ENABLED
            </code>{" "}
            to anything other than <code>true</code> (or unset it) and
            this page returns 404 again.
          </p>
        </footer>
      </div>
    </main>
  );
}
