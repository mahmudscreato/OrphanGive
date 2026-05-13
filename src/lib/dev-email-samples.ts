// Session 34 Part C — sample data registry for the /dev/email-review
// developer tool. One entry per transactional template; the entry
// gives the email a stable id, a human-readable title, the React
// component to render, and the props to render it with.
//
// The whole module is dev-only. Nothing here ships in normal user
// flows — the registry is consumed by /api/dev/send-test-email and
// /dev/email-review, both of which are gated on
// NEXT_PUBLIC_DEV_TOOLS_ENABLED.
//
// Why hard-coded sample data instead of wiring to real DB rows:
// the goal is "Mahmud sees every transactional email rendered with
// realistic-looking values, end to end through Resend". We don't
// need real children/donors — and using fake data means the review
// flow works on a fresh dev box with zero seed data.
//
// Sample personas (kept consistent across templates so subjects
// read coherently when Mahmud sees them in his inbox):
//   • Donor: "Test Donor" <mahmud@printagraphy.com>, first name "Test"
//   • Child: "Imran Ali", 9, Khulna, ৳1,500/mo (~$14/mo)

import type { ReactElement } from "react";

import {
  DonorApprovedEmail,
  type DonorApprovedEmailProps,
} from "@/emails/DonorApprovedEmail";
import {
  MonthlyReceiptEmail,
  type MonthlyReceiptEmailProps,
} from "@/emails/MonthlyReceiptEmail";
import {
  OperationalNoticeEmail,
  type OperationalNoticeEmailProps,
} from "@/emails/OperationalNoticeEmail";
import {
  RevealApprovedEmail,
  type RevealApprovedEmailProps,
} from "@/emails/RevealApprovedEmail";
import {
  RevealDeniedEmail,
  type RevealDeniedEmailProps,
} from "@/emails/RevealDeniedEmail";
import {
  SponsorshipActivatedEmail,
  type SponsorshipActivatedEmailProps,
} from "@/emails/SponsorshipActivatedEmail";
import {
  SponsorshipCancelledEmail,
  type SponsorshipCancelledEmailProps,
} from "@/emails/SponsorshipCancelledEmail";
import {
  SponsorshipExtendedEmail,
  type SponsorshipExtendedEmailProps,
} from "@/emails/SponsorshipExtendedEmail";
import {
  SponsorshipModifiedEmail,
  type SponsorshipModifiedEmailProps,
} from "@/emails/SponsorshipModifiedEmail";
import {
  SponsorshipPausedEmail,
  type SponsorshipPausedEmailProps,
} from "@/emails/SponsorshipPausedEmail";
import {
  SponsorshipQueueJoinedEmail,
  type SponsorshipQueueJoinedEmailProps,
} from "@/emails/SponsorshipQueueJoinedEmail";
import {
  SponsorshipQueueShiftEmail,
  type SponsorshipQueueShiftEmailProps,
} from "@/emails/SponsorshipQueueShiftEmail";
import {
  SponsorshipWelcomeEmail,
  type SponsorshipWelcomeEmailProps,
} from "@/emails/SponsorshipWelcomeEmail";

// Stable URL base for any links in templates. Doesn't have to
// resolve to a real page during review — Mahmud just needs to see
// what the link looks like in the rendered email.
const BASE_URL = "https://orphangive.org";

// Fixed clock so receipt dates etc. don't churn between runs.
// Also keeps the rendered output reproducible in screenshots.
const NOW_ISO = "2026-05-12T10:00:00.000Z";
const NEXT_MONTH_ISO = "2026-06-12T10:00:00.000Z";
const ONE_YEAR_OUT_ISO = "2027-05-12T10:00:00.000Z";

// ---------------------------------------------------------------
// Per-template sample props. Each is deliberately a typed const so
// the moment a template's prop signature changes (added field,
// renamed field, etc.) tsc breaks here and we know to update.
// ---------------------------------------------------------------

const donorApproved: DonorApprovedEmailProps = {
  firstName: "Test",
  browseUrl: `${BASE_URL}/children`,
};

const monthlyReceipt: MonthlyReceiptEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  amountUsd: 14,
  paidAt: NOW_ISO,
  paymentMethodLast4: "4242",
  paymentMethodBrand: "Visa",
  stripeReceiptUrl: "https://pay.stripe.com/receipts/example",
  nextBillingDate: NEXT_MONTH_ISO,
  dashboardUrl: `${BASE_URL}/dashboard`,
  causeLabel: "Education and learning",
  visibilityLabel: "Named sponsor",
};

const operationalNotice: OperationalNoticeEmailProps = {
  heading: "New contact form message",
  eyebrow: "Sponsorship question",
  intro: "From Test Donor (mahmud@printagraphy.com).",
  sections: [
    {
      label: "Submitted by",
      body: "Test Donor\nmahmud@printagraphy.com",
    },
    { label: "Subject", body: "Sponsorship question" },
    {
      label: "Message",
      body: "Hi — I'd like to sponsor a child in Khulna and want to know what flexibility I have to switch to a different cause down the road. Thanks!",
    },
  ],
  replyToNudge: "mahmud@printagraphy.com",
};

const revealApproved: RevealApprovedEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  childId: "00000000-0000-0000-0000-000000000001",
  fieldLabel: "Full school name",
  profileUrl: `${BASE_URL}/dashboard/sponsorships/example`,
};

const revealDenied: RevealDeniedEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  fieldLabel: "Home address",
  adminNote:
    "We can't share specific address details for child-safety reasons. Happy to confirm the district (Khulna) and a general locality if helpful.",
};

const sponsorshipActivated: SponsorshipActivatedEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  childDistrict: "Khulna",
  childAge: 9,
  amountUsd: 14,
  durationMonths: 12,
  scheduledEndDate: ONE_YEAR_OUT_ISO,
  paymentScheduleLabel: "monthly",
  causeLabel: "Education and learning",
  visibilityLabel: "Named sponsor",
  sponsorshipUrl: `${BASE_URL}/dashboard/sponsorships/example`,
};

const sponsorshipCancelled: SponsorshipCancelledEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  browseUrl: `${BASE_URL}/children`,
};

const sponsorshipExtended: SponsorshipExtendedEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  additionalMonths: 6,
  newDurationMonths: 18,
  monthsRemaining: 12,
  newEndDateIso: "2027-11-12T10:00:00.000Z",
  paidNow: true,
  paymentAmountUsd: 84,
  monthlyExtensionAfterPrepaid: false,
  prepaidEndDateIso: null,
  monthlyAmountUsd: 14,
  sponsorshipUrl: `${BASE_URL}/dashboard/sponsorships/example`,
  causeLabel: "Education and learning",
  visibilityLabel: "Named sponsor",
};

const sponsorshipModified: SponsorshipModifiedEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  oldAmountUsd: 14,
  newAmountUsd: 21,
  nextBillingDate: NEXT_MONTH_ISO,
  prorationCents: 350,
  dashboardUrl: `${BASE_URL}/dashboard`,
};

const sponsorshipPaused: SponsorshipPausedEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  resumeUrl: `${BASE_URL}/dashboard/sponsorships/example`,
};

const sponsorshipQueueJoined: SponsorshipQueueJoinedEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  childDistrict: "Khulna",
  childAge: 9,
  queuePosition: 2,
  estimatedStartDate: "2026-08-12T10:00:00.000Z",
  amountUsd: 14,
  durationMonths: 12,
  paymentScheduleLabel: "monthly_trial",
  causeLabel: "Education and learning",
  visibilityLabel: "Named sponsor",
  sponsorshipUrl: `${BASE_URL}/dashboard/sponsorships/example`,
};

const sponsorshipQueueShift: SponsorshipQueueShiftEmailProps = {
  firstName: "Test",
  childName: "Imran Ali",
  activeSponsorFirstName: "Aisha",
  oldStartDate: "2026-08-12T10:00:00.000Z",
  newStartDate: "2026-09-12T10:00:00.000Z",
  decisionUrl: `${BASE_URL}/dashboard/sponsorships/example/queue-shift`,
  autoAccepted: false,
};

const sponsorshipWelcome: SponsorshipWelcomeEmailProps = {
  firstName: "Test",
  sponsorships: [
    {
      childName: "Imran Ali",
      childDistrict: "Khulna",
      childAge: 9,
      childGenderPronoun: "he",
      paymentMode: "monthly",
      amountUsd: 14,
      nextBillingDate: NEXT_MONTH_ISO,
      causeLabel: "Education and learning",
      visibilityLabel: "Named sponsor",
    },
  ],
  dashboardUrl: `${BASE_URL}/dashboard`,
};

// ---------------------------------------------------------------
// Registry. Order is the order Mahmud sees them on /dev/email-review.
// ---------------------------------------------------------------

export type EmailSample = {
  /** Stable id used in the URL + the API body. */
  id: string;
  /** Human-readable title shown in the review UI. */
  title: string;
  /** One-line description of when this email fires. */
  description: string;
  /** The React Email element to render (already includes props). */
  render: () => ReactElement;
  /** Subject line. The route prepends "[TEST] " automatically. */
  subject: string;
};

export const EMAIL_SAMPLES: readonly EmailSample[] = [
  {
    id: "donor-approved",
    title: "Donor approved",
    description:
      "Sent when an admin approves a new donor application — they can now browse + sponsor.",
    render: () => DonorApprovedEmail(donorApproved),
    subject: "Welcome to OrphanGive — your donor account is ready",
  },
  {
    id: "sponsorship-welcome",
    title: "Sponsorship welcome",
    description:
      "Sent immediately after the first checkout — confirms the sponsorship(s) just placed.",
    render: () => SponsorshipWelcomeEmail(sponsorshipWelcome),
    subject: "Thank you for sponsoring Imran Ali",
  },
  {
    id: "sponsorship-activated",
    title: "Sponsorship activated",
    description:
      "Sent when a queued sponsorship transitions to active (i.e. the child becomes available).",
    render: () => SponsorshipActivatedEmail(sponsorshipActivated),
    subject: "Your sponsorship of Imran Ali is now active",
  },
  {
    id: "sponsorship-queue-joined",
    title: "Sponsorship — queue joined",
    description:
      "Sent when a sponsorship is placed but the child already has an active sponsor → the donor is queued.",
    render: () => SponsorshipQueueJoinedEmail(sponsorshipQueueJoined),
    subject: "You're queued to sponsor Imran Ali",
  },
  {
    id: "sponsorship-queue-shift",
    title: "Sponsorship — queue shift",
    description:
      "Sent when the active sponsor changes their end date → queued donor's start date shifts.",
    render: () => SponsorshipQueueShiftEmail(sponsorshipQueueShift),
    subject: "Your start date for Imran Ali has shifted",
  },
  {
    id: "sponsorship-modified",
    title: "Sponsorship modified",
    description:
      "Sent when the donor changes their monthly amount on an active sponsorship.",
    render: () => SponsorshipModifiedEmail(sponsorshipModified),
    subject: "Your sponsorship amount has been updated",
  },
  {
    id: "sponsorship-extended",
    title: "Sponsorship extended",
    description:
      "Sent when the donor extends an existing sponsorship past its scheduled end date.",
    render: () => SponsorshipExtendedEmail(sponsorshipExtended),
    subject: "Your sponsorship of Imran Ali has been extended",
  },
  {
    id: "sponsorship-paused",
    title: "Sponsorship paused",
    description: "Sent when the donor pauses an active sponsorship.",
    render: () => SponsorshipPausedEmail(sponsorshipPaused),
    subject: "Your sponsorship of Imran Ali is paused",
  },
  {
    id: "sponsorship-cancelled",
    title: "Sponsorship cancelled",
    description: "Sent when the donor cancels an active sponsorship.",
    render: () => SponsorshipCancelledEmail(sponsorshipCancelled),
    subject: "Your sponsorship of Imran Ali has ended",
  },
  {
    id: "monthly-receipt",
    title: "Monthly receipt",
    description:
      "Sent each month after the recurring charge succeeds — donor's tax-deductible record.",
    render: () => MonthlyReceiptEmail(monthlyReceipt),
    subject: "Your OrphanGive receipt for May 2026",
  },
  {
    id: "reveal-approved",
    title: "Profile reveal — approved",
    description:
      "Sent when admin approves a donor's request to see a hidden child-profile field.",
    render: () => RevealApprovedEmail(revealApproved),
    subject: "Your reveal request was approved",
  },
  {
    id: "reveal-denied",
    title: "Profile reveal — denied",
    description:
      "Sent when admin denies a donor's request to see a hidden child-profile field.",
    render: () => RevealDeniedEmail(revealDenied),
    subject: "About your reveal request",
  },
  {
    id: "operational-notice",
    title: "Operational notice (contact / referral / volunteer)",
    description:
      "Shared template used by all three public form submissions → support@orphangive.org. Sample shows a contact-form message; orphan referral and volunteer use the same shell with different sections.",
    render: () => OperationalNoticeEmail(operationalNotice),
    subject: "Contact form: Sponsorship question",
  },
] as const;

export function getSampleById(id: string): EmailSample | undefined {
  return EMAIL_SAMPLES.find((s) => s.id === id);
}
