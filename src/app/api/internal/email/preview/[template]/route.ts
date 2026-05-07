import { NextResponse, type NextRequest } from "next/server";
import { renderTemplate, sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import { DonorApprovedEmail } from "@/emails/DonorApprovedEmail";
import {
  SponsorshipWelcomeEmail,
  type SponsorshipWelcomeItem,
} from "@/emails/SponsorshipWelcomeEmail";
import { RevealApprovedEmail } from "@/emails/RevealApprovedEmail";
import { RevealDeniedEmail } from "@/emails/RevealDeniedEmail";
import { MonthlyReceiptEmail } from "@/emails/MonthlyReceiptEmail";
import { SponsorshipPausedEmail } from "@/emails/SponsorshipPausedEmail";
import { SponsorshipModifiedEmail } from "@/emails/SponsorshipModifiedEmail";
import { SponsorshipCancelledEmail } from "@/emails/SponsorshipCancelledEmail";
import { SponsorshipExtendedEmail } from "@/emails/SponsorshipExtendedEmail";

export const runtime = "nodejs";

const TEMPLATES = [
  "donor-approved",
  "sponsorship-welcome",
  "reveal-approved",
  "reveal-denied",
  "monthly-receipt",
  "sponsorship-paused",
  "sponsorship-modified",
  "sponsorship-cancelled",
  "sponsorship-extended",
] as const;
type TemplateId = (typeof TEMPLATES)[number];

function isTemplateId(v: string): v is TemplateId {
  return (TEMPLATES as readonly string[]).includes(v);
}

function buildSample(template: TemplateId, firstName: string) {
  switch (template) {
    case "donor-approved":
      return {
        subject: `Welcome to OrphanGive, ${firstName}`,
        element: DonorApprovedEmail({
          firstName,
          browseUrl: siteUrl("/children"),
        }),
      };

    case "sponsorship-welcome": {
      const items: SponsorshipWelcomeItem[] = [
        {
          childName: "Mim Khatun",
          childDistrict: "Sylhet",
          childAge: 9,
          childGenderPronoun: "she",
          paymentMode: "monthly",
          amountUsd: 25,
          nextBillingDate: new Date(
            Date.now() + 30 * 86_400_000,
          ).toISOString(),
        },
      ];
      return {
        subject: `Thank you, ${firstName} — your sponsorship begins today`,
        element: SponsorshipWelcomeEmail({
          firstName,
          sponsorships: items,
          dashboardUrl: siteUrl("/dashboard"),
        }),
      };
    }

    case "reveal-approved":
      return {
        subject: "Your reveal request was approved",
        element: RevealApprovedEmail({
          firstName,
          childName: "Mim Khatun",
          childId: "00000000-0000-0000-0000-000000000000",
          fieldLabel: "Guardian's name",
          profileUrl: siteUrl(
            "/children/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };

    case "reveal-denied":
      return {
        subject: "Your reveal request — update from our team",
        element: RevealDeniedEmail({
          firstName,
          childName: "Mim Khatun",
          fieldLabel: "Full address",
          adminNote:
            "We share home addresses only after a longer relationship has been established. Please ask again after a few months of monthly sponsorship.",
        }),
      };

    case "monthly-receipt":
      return {
        subject: subjectForReceipt("Mim Khatun"),
        element: MonthlyReceiptEmail({
          firstName,
          childName: "Mim Khatun",
          amountUsd: 25,
          paidAt: new Date().toISOString(),
          paymentMethodLast4: "4242",
          paymentMethodBrand: "visa",
          stripeReceiptUrl:
            "https://pay.stripe.com/receipts/example",
          nextBillingDate: new Date(
            Date.now() + 30 * 86_400_000,
          ).toISOString(),
          dashboardUrl: siteUrl("/dashboard"),
        }),
      };

    case "sponsorship-paused":
      return {
        subject: "Your sponsorship of Mim Khatun is paused",
        element: SponsorshipPausedEmail({
          firstName,
          childName: "Mim Khatun",
          resumeUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };

    case "sponsorship-modified":
      return {
        subject: "Your sponsorship amount has been updated",
        element: SponsorshipModifiedEmail({
          firstName,
          childName: "Mim Khatun",
          oldAmountUsd: 25,
          newAmountUsd: 50,
          nextBillingDate: new Date(
            Date.now() + 12 * 86_400_000,
          ).toISOString(),
          prorationCents: 1041,
          dashboardUrl: siteUrl("/dashboard"),
        }),
      };

    case "sponsorship-cancelled":
      return {
        subject: "Your sponsorship of Mim Khatun has ended",
        element: SponsorshipCancelledEmail({
          firstName,
          childName: "Mim Khatun",
          browseUrl: siteUrl("/children"),
        }),
      };

    case "sponsorship-extended":
      return {
        subject: "Your sponsorship of Mim Khatun has been extended",
        element: SponsorshipExtendedEmail({
          firstName,
          childName: "Mim Khatun",
          additionalMonths: 3,
          newDurationMonths: 9,
          monthsRemaining: 8,
          newEndDateIso: new Date(
            Date.now() + 8 * 30.44 * 86_400_000,
          ).toISOString(),
          paidNow: true,
          paymentAmountUsd: 75,
          sponsorshipUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };
  }
}

function subjectForReceipt(childName: string): string {
  const d = new Date();
  const month = d.toLocaleString("en-US", { month: "long" });
  return `Receipt — ${month} ${d.getFullYear()} sponsorship of ${childName}`;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ template: string }> },
) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  const { template } = await ctx.params;
  if (!isTemplateId(template)) {
    return NextResponse.json(
      {
        error: `unknown template "${template}". valid: ${TEMPLATES.join(", ")}`,
      },
      { status: 404 },
    );
  }

  const url = new URL(req.url);
  const to = url.searchParams.get("to")?.trim() || null;
  const firstName =
    url.searchParams.get("firstName")?.trim() || "Mahmud";
  const send = url.searchParams.get("send") === "1" || Boolean(to);

  const sample = buildSample(template, firstName);

  // If `to` is provided (or send=1), send via Resend AND return the HTML.
  if (send && to) {
    const result = await sendEmail({
      to,
      subject: sample.subject,
      template: sample.element,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    // Return rendered HTML so the caller can preview it in the browser.
    return new NextResponse(result.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Email-Sent-To": to,
        "X-Email-Message-Id": result.messageId,
      },
    });
  }

  // Otherwise just render and return — useful for designing without sending.
  const { html } = await renderTemplate(sample.element);
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
