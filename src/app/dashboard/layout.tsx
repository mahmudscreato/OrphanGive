import { redirect } from "next/navigation";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { signOutAction } from "@/app/(auth)/actions";
import { ToastProvider } from "@/components/ui/Toast";
import { DashboardSidebar } from "./components/DashboardSidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const donor = await getCurrentDonor();
  const state = getDonorState(donor);

  switch (state) {
    case "unauthenticated":
      redirect("/signin?next=/dashboard");
    case "pending_verification":
      redirect(
        `/signup/verify?email=${encodeURIComponent(donor?.email ?? "")}`,
      );
    case "suspended":
      redirect("/signin?error=suspended");
    case "rejected":
      redirect("/signin?reason=rejected");
    case "pending_approval":
      return (
        <div className="relative bg-cream min-h-screen">
          <div className="absolute top-5 right-6 z-10">
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-[12.5px] text-slate-soft hover:text-tangerine-deep transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
          <div className="px-6 pt-20 pb-24 max-md:pt-16 max-md:pb-16">
            <div className="max-w-[760px] mx-auto">{children}</div>
          </div>
        </div>
      );
    case "approved":
      return (
        <ToastProvider>
          {/* Session 23 — page canvas shifts from `cream` (#FFFAF2)
              to `bg-canvas` (warm peach #FBF1E5) to match the
              Session 16 redesigned public surfaces. Pending state
              stays cream as a transitional contrast. */}
          <div className="bg-bg-canvas min-h-screen">
            <DashboardSidebar donor={donor!} />
            <div className="md:ml-60">
              <div className="px-10 pt-12 pb-24 max-md:px-6 max-md:pt-20 max-md:pb-16">
                <div className="max-w-[1080px] mx-auto">{children}</div>
              </div>
            </div>
          </div>
        </ToastProvider>
      );
  }
}
