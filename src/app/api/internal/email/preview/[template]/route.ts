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
import { ReportPublishedEmail } from "@/emails/ReportPublishedEmail";
// Email-refinement lot — extend the preview surface to cover every
// template, so the founder walkthrough can hit ALL paths via this
// single endpoint without manufacturing heavy production data.
import { SponsorshipQueueJoinedEmail } from "@/emails/SponsorshipQueueJoinedEmail";
import { SponsorshipActivatedEmail } from "@/emails/SponsorshipActivatedEmail";
import { SponsorshipQueueShiftEmail } from "@/emails/SponsorshipQueueShiftEmail";
import { SponsorshipRefundEmail } from "@/emails/SponsorshipRefundEmail";
import { SponsorshipResumedEmail } from "@/emails/SponsorshipResumedEmail";
import { CampaignDonationThankYouEmail } from "@/emails/CampaignDonationThankYouEmail";
import { OperationalNoticeEmail } from "@/emails/OperationalNoticeEmail";
import { AdminPendingSubmissionEmail } from "@/emails/AdminPendingSubmissionEmail";
import { OtpVerificationEmail } from "@/emails/OtpVerificationEmail";

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
  "report-published-progress",
  "report-published-deployment",
  // Email-refinement lot additions:
  "sponsorship-queue-joined",
  "sponsorship-activated",
  "sponsorship-queue-shift",
  "sponsorship-refund",
  "sponsorship-resumed",
  "campaign-thank-you",
  "operational-notice",
  "admin-pending-submission",
  "otp-verification",
] as const;
type TemplateId = (typeof TEMPLATES)[number];

function isTemplateId(v: string): v is TemplateId {
  return (TEMPLATES as readonly string[]).includes(v);
}

function buildSample(template: TemplateId, firstName: string) {
  switch (template) {
    case "donor-approved":
      return {
        subject: `Welcome to OrphanGive, ${firstName} — you're in`,
        element: DonorApprovedEmail({
          firstName,
          browseUrl: siteUrl("/children"),
        }),
      };

    case "sponsorship-welcome": {
      const items: SponsorshipWelcomeItem[] = [
        {
          childName: "Mim",
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
        subject: `Thank you, ${firstName} — Mim now has you in her corner`,
        element: SponsorshipWelcomeEmail({
          firstName,
          sponsorships: items,
          dashboardUrl: siteUrl("/dashboard"),
        }),
      };
    }

    case "reveal-approved":
      return {
        subject: `Mim's guardian's name is now visible to you`,
        element: RevealApprovedEmail({
          firstName,
          childName: "Mim",
          childId: "00000000-0000-0000-0000-000000000000",
          fieldLabel: "Guardian's name",
          profileUrl: siteUrl(
            "/children/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };

    case "reveal-denied":
      return {
        subject: `Your reveal request for Mim — a quick note from our team`,
        element: RevealDeniedEmail({
          firstName,
          childName: "Mim",
          fieldLabel: "Full address",
          adminNote:
            "We share home addresses only after a longer relationship has been established. Please ask again after a few months of monthly sponsorship.",
        }),
      };

    case "monthly-receipt":
      return {
        subject: subjectForReceipt("Mim"),
        element: MonthlyReceiptEmail({
          firstName,
          childName: "Mim",
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
        subject: "Your sponsorship of Mim is paused for now",
        element: SponsorshipPausedEmail({
          firstName,
          childName: "Mim",
          resumeUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };

    case "sponsorship-modified":
      return {
        subject: "Your monthly amount for Mim is updated",
        element: SponsorshipModifiedEmail({
          firstName,
          childName: "Mim",
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
        subject: "Your sponsorship of Mim has ended — thank you",
        element: SponsorshipCancelledEmail({
          firstName,
          childName: "Mim",
          browseUrl: siteUrl("/children"),
        }),
      };

    case "sponsorship-extended":
      return {
        subject: "Thank you for extending — Mim is held a little longer",
        element: SponsorshipExtendedEmail({
          firstName,
          childName: "Mim",
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

    // Spine Lot 2 — donor email when admin sends an approved report.
    // Two preview variants matching the two report_type values.
    case "report-published-progress":
      return {
        subject: `Mim has a new update for you`,
        element: ReportPublishedEmail({
          firstName,
          childName: "Mim",
          reportType: "progress",
          sponsorshipUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };
    case "report-published-deployment":
      return {
        subject: `Your gift reached Mim — see the moment`,
        element: ReportPublishedEmail({
          firstName,
          childName: "Mim",
          reportType: "deployment",
          sponsorshipUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };

    // ─── Email-refinement lot — new preview cases ───────────────────
    case "sponsorship-queue-joined":
      return {
        subject: `You're in line to sponsor Mim — thank you for waiting`,
        element: SponsorshipQueueJoinedEmail({
          firstName,
          childName: "Mim",
          childDistrict: "Sylhet",
          childAge: 9,
          queuePosition: 2,
          estimatedStartDate: new Date(
            Date.now() + 45 * 86_400_000,
          ).toISOString(),
          amountUsd: 25,
          durationMonths: 12,
          paymentScheduleLabel: "monthly_trial",
          sponsorshipUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };

    case "sponsorship-activated":
      return {
        subject: `Your sponsorship of Mim starts today`,
        element: SponsorshipActivatedEmail({
          firstName,
          childName: "Mim",
          childDistrict: "Sylhet",
          childAge: 9,
          amountUsd: 25,
          durationMonths: 12,
          scheduledEndDate: new Date(
            Date.now() + 365 * 86_400_000,
          ).toISOString(),
          paymentScheduleLabel: "monthly",
          sponsorshipUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };

    case "sponsorship-queue-shift":
      return {
        subject: `Your sponsorship of Mim has a new start date — small choice for you`,
        element: SponsorshipQueueShiftEmail({
          firstName,
          childName: "Mim",
          activeSponsorFirstName: "Sarah",
          oldStartDate: new Date(
            Date.now() + 30 * 86_400_000,
          ).toISOString(),
          newStartDate: new Date(
            Date.now() + 120 * 86_400_000,
          ).toISOString(),
          decisionUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000/queue-shift-decision",
          ),
        }),
      };

    case "sponsorship-refund":
      return {
        subject: `A refund is on its way for your sponsorship of Mim`,
        element: SponsorshipRefundEmail({
          firstName,
          childName: "Mim",
          amount: 25,
          currency: "USD",
          adminReason:
            "We weren't able to process the photo permission for this month. You'll get a full refund automatically.",
          dashboardUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
        }),
      };

    case "sponsorship-resumed":
      return {
        subject: `Mim's sponsorship is active again`,
        element: SponsorshipResumedEmail({
          firstName,
          childName: "Mim",
          dashboardUrl: siteUrl(
            "/dashboard/sponsorship/00000000-0000-0000-0000-000000000000",
          ),
          byAdmin: true,
        }),
      };

    case "campaign-thank-you":
      return {
        subject: `Thank you, ${firstName} — your gift is on its way`,
        element: CampaignDonationThankYouEmail({
          donorFirstName: firstName,
          amount: "$25 USD",
          causeName: "Feed a child for a week",
          causeTag: "feed-a-child",
          paidAt: new Date(),
          dashboardUrl: siteUrl("/dashboard"),
        }),
      };

    case "operational-notice":
      return {
        subject: `Contact form: Sponsorship question`,
        element: OperationalNoticeEmail({
          heading: "New contact form message",
          eyebrow: "Sponsorship question",
          intro: `From ${firstName} (${firstName.toLowerCase()}@example.com).`,
          sections: [
            { label: "Submitted by", body: `${firstName}\n${firstName.toLowerCase()}@example.com` },
            { label: "Subject", body: "Sponsorship question" },
            {
              label: "Message",
              body:
                "Hi — I'd like to know how often I'll receive updates about the child I'm sponsoring, and whether photos are included. Thank you.",
            },
          ],
          replyToNudge: `${firstName.toLowerCase()}@example.com`,
        }),
      };

    case "admin-pending-submission":
      return {
        subject: `New report from ${firstName} for Mim`,
        element: AdminPendingSubmissionEmail({
          collectionLabel: "report",
          submitterFirstName: firstName,
          childDisplayName: "Mim",
          summary:
            "Q1 progress report covering school attendance, health check-ups, and the new winter clothing distribution. Three photos attached.",
          reviewUrl:
            "https://admin.orphangive.org/admin/content/report/00000000-0000-0000-0000-000000000000",
        }),
      };

    case "otp-verification":
      return {
        subject: `Your OrphanGive verification code`,
        element: OtpVerificationEmail({
          fullName: firstName,
          code: "482917",
        }),
      };
  }
}

function subjectForReceipt(childName: string): string {
  const d = new Date();
  const month = d.toLocaleString("en-US", { month: "long" });
  return `${childName}'s sponsorship for ${month} ${d.getFullYear()} — your receipt`;
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
