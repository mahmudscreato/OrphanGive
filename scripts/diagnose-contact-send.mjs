// Session 34 Part A — diagnose the contact-form send failure.
// Calls Resend directly (mirrors what `sendEmail()` does in
// src/lib/email.ts) so we see the actual API error, not the
// generic message the route returns to the user.

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromEnv = process.env.RESEND_FROM_EMAIL;

console.log("RESEND_API_KEY present:", apiKey ? "yes (length " + apiKey.length + ")" : "NO");
console.log("RESEND_FROM_EMAIL:", fromEnv ?? "(unset — will fall back to OrphanGive <hello@orphangive.org>)");
console.log("API key prefix:", apiKey ? apiKey.slice(0, 5) : "—");

if (!apiKey) {
  console.error("\n✗ Cannot test — RESEND_API_KEY missing.");
  process.exit(1);
}

const from = fromEnv ?? "OrphanGive <hello@orphangive.org>";
const resend = new Resend(apiKey);

console.log(`\nAttempting test send: from=${from} → to=support@orphangive.org`);

try {
  const result = await resend.emails.send({
    from,
    to: "support@orphangive.org",
    subject: "[diagnose] Contact-send pipeline test",
    html: "<p>Test from diagnose-contact-send.mjs.</p>",
    text: "Test from diagnose-contact-send.mjs.",
    replyTo: "test@example.com",
  });
  console.log("\nRaw result:", JSON.stringify(result, null, 2));
  if (result.error) {
    console.error("\n✗ Resend returned error:");
    console.error("  name:", result.error.name);
    console.error("  message:", result.error.message);
    console.error("  statusCode:", result.error.statusCode);
  } else if (result.data?.id) {
    console.log("\n✓ Send succeeded. Message ID:", result.data.id);
  }
} catch (err) {
  console.error("\n✗ Threw exception:");
  console.error("  name:", err?.name);
  console.error("  message:", err?.message);
  console.error("  stack:", err?.stack?.split("\n").slice(0, 5).join("\n"));
}
