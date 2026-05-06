import type { Donor } from "@/lib/donor-data";
import { signOutAction } from "@/app/(auth)/actions";

export function DonorWelcome({
  donor,
  approved,
}: {
  donor: Pick<Donor, "first_name" | "email">;
  approved: boolean;
}) {
  const firstName = (donor.first_name || "").trim() || donor.email.split("@")[0];
  const pillClass = approved
    ? "bg-moss-soft text-moss border-moss/30"
    : "bg-tangerine-mist text-tangerine-deep border-tangerine-soft";
  const pillText = approved ? "Approved donor" : "Awaiting approval";

  return (
    <header className="flex flex-wrap items-end justify-between gap-y-4 gap-x-8">
      <div>
        <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4.5vw,3.25rem)]">
          Welcome back, {firstName}.
        </h1>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <span className="text-[14px] text-slate">
            Signed in as <span className="text-ink">{donor.email}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border ${pillClass}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${approved ? "bg-moss" : "bg-tangerine"}`}
            />
            {pillText}
          </span>
        </div>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          className="text-[13px] text-slate hover:text-tangerine-deep transition-colors underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}

export default DonorWelcome;
