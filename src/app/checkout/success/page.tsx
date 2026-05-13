import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCurrentDonor } from "@/lib/donor-data";
import { SuccessPoller } from "./SuccessPoller";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Thank you — OrphanGive",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const donor = await getCurrentDonor();
  if (!donor) {
    redirect("/signin?next=/dashboard");
  }

  const params = await searchParams;
  const raw = params.ids;
  const idsParam = Array.isArray(raw) ? raw[0] : raw;
  const expectedIds = (idsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));

  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;

  return (
    <div className="min-h-screen bg-cream">
      <header className="px-6 pt-8 max-md:pt-6">
        <div className="max-w-[1100px] mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 font-display text-[20px] font-medium text-ink tracking-[-0.01em]"
          >
            <Image
              src="/logo-mark.png"
              alt="OrphanGive"
              width={32}
              height={32}
              className="w-8 h-8"
              priority
            />
            OrphanGive
          </Link>
        </div>
      </header>

      <section className="px-6 pt-16 pb-24 max-md:pt-10 max-md:pb-16">
        <div className="max-w-[640px] mx-auto">
          <SuccessPoller
            expectedIds={expectedIds}
            donorFirstName={firstName}
            donorEmail={donor.email}
          />
        </div>
      </section>
    </div>
  );
}
