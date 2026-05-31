// Debug script — render a template and dump HTML for inspection.
// Usage: npx tsx scripts/render-email-debug.mjs <template>
// Templates: refund | welcome | activated | otp
import { render } from '@react-email/render';

const which = process.argv[2] ?? 'refund';

let element;
if (which === 'refund') {
  const { SponsorshipRefundEmail } = await import('../src/emails/SponsorshipRefundEmail.tsx');
  element = SponsorshipRefundEmail({
    firstName: 'Mahmud', childName: 'Mim', amount: 25, currency: 'USD',
    adminReason: 'Test reason.', dashboardUrl: 'https://orphangive.org/x',
  });
} else if (which === 'welcome') {
  const { SponsorshipWelcomeEmail } = await import('../src/emails/SponsorshipWelcomeEmail.tsx');
  element = SponsorshipWelcomeEmail({
    firstName: 'Mahmud',
    sponsorships: [{
      childName: 'Mim', childDistrict: 'Sylhet', childAge: 9,
      childGenderPronoun: 'she', paymentMode: 'monthly', amountUsd: 25,
      nextBillingDate: new Date(Date.now() + 30*86400000).toISOString(),
    }],
    dashboardUrl: 'https://orphangive.org/dashboard',
  });
} else if (which === 'activated') {
  const { SponsorshipActivatedEmail } = await import('../src/emails/SponsorshipActivatedEmail.tsx');
  element = SponsorshipActivatedEmail({
    firstName: 'Mahmud', childName: 'Mim', childDistrict: 'Sylhet', childAge: 9,
    amountUsd: 25, durationMonths: 12,
    scheduledEndDate: new Date(Date.now()+365*86400000).toISOString(),
    paymentScheduleLabel: 'monthly',
    sponsorshipUrl: 'https://orphangive.org/x',
  });
} else if (which === 'otp') {
  const { OtpVerificationEmail } = await import('../src/emails/OtpVerificationEmail.tsx');
  element = OtpVerificationEmail({ fullName: 'Mahmud', code: '482917' });
}

const html = await render(element);
console.log(html);
