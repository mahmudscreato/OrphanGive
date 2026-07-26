// fix/child-profile-support-cta — guest one-time gift FOR a specific child.
//
// PUBLIC — deliberately NO auth gate (contrast with /sponsor/[childId], which
// redirects to /signin). A visitor arriving from the child profile's "Support
// [Name]" CTA can give a one-time gift WITHOUT signing in; an account is
// offered optionally AFTER payment (the existing /donate/quick/success flow).
// Monthly/recurring sponsorship genuinely needs an account and stays on
// /sponsor/[childId] (linked as a secondary option inside the form).
//
// Reuses the existing guest machinery: the charge runs on the resolved general
// one_time package (the same pooled vehicle the cause donations use); the child
// link is recorded via the Stripe line-item label + guest_donation title +
// Stripe metadata (see /api/donate/guest-init). No new payment path, no schema
// change.

import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getChildById } from "@/lib/child-profile-data";
import { loadDonateModuleData } from "@/lib/donate-module";
import { SupportChildClient } from "@/components/donate/SupportChildClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  let name: string | null = null;
  try {
    const child = await getChildById(childId, "public");
    name = child?.display_name?.trim() ?? null;
  } catch {
    /* fall through to generic metadata */
  }
  return {
    ...buildPageMetadata({
      path: `/support/${childId}`,
      title: name ? `Support ${name}` : "Support a child",
      description:
        "Make a one-time gift to a verified child in Bangladesh — no account needed.",
    }),
    // Mirror the child-profile privacy posture: real-named surfaces are
    // never search-indexed.
    robots: { index: false, follow: false },
  };
}

export default async function SupportChildPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;

  // Public tier — display_name is first_name only (P1.3). No auth required.
  const [child, donateData] = await Promise.all([
    getChildById(childId, "public"),
    loadDonateModuleData(),
  ]);

  if (!child) notFound();

  const childFirstName = child.display_name.split(" ")[0]!;
  // The charge vehicle: the resolved general one_time package (causes[0] =
  // "Where most needed" / general_care). guest-init labels it "Support <Name>".
  const generalPackageId = donateData.causes[0]?.packageId ?? null;

  return (
    <div className="bg-cream min-h-screen">
      <div className="px-6 pt-10 max-md:pt-6">
        <div className="max-w-[720px] mx-auto">
          <Breadcrumb
            crumbs={[
              { href: "/", label: "Home" },
              { href: "/children", label: "Browse children" },
              { href: `/children/${child.id}`, label: child.display_name },
              { label: "Support" },
            ]}
          />
        </div>
      </div>

      <div className="px-6 py-10 max-md:py-8">
        <div className="max-w-[720px] mx-auto">
          {generalPackageId ? (
            <SupportChildClient
              childId={child.id}
              childFirstName={childFirstName}
              packageId={generalPackageId}
              currencySymbol={donateData.currencySymbol}
              currencyCode={donateData.currencyCode}
              customFloor={donateData.customFloor}
            />
          ) : (
            <p className="rounded-2xl border border-ink/[0.08] bg-white p-6 text-[15px] text-slate italic">
              Giving is temporarily unavailable. Please check back soon, or{" "}
              <a
                href={`/children/${child.id}`}
                className="text-tangerine-deeper underline-offset-4 hover:underline"
              >
                return to {childFirstName}&rsquo;s profile
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
