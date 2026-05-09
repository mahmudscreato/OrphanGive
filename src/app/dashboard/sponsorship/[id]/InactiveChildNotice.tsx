// Fallback shown in place of the re-support buttons when the
// sponsored child's row is no longer status='active' on Directus —
// either deactivated by charity admin or removed from the public
// program. Routing to /sponsor/[childId] would hit a 404
// (getChildById returns null for non-active children at admin tier),
// so we surface a kind off-ramp to /children instead.

import Link from "next/link";

type Props = {
  childName: string;
};

export function InactiveChildNotice({ childName }: Props) {
  const firstName = (childName?.trim() || "").split(/\s+/)[0] || "This child";
  return (
    <section className="mt-10 rounded-[18px] bg-cream border border-ink/[0.06] px-5 py-4">
      <p className="text-[14px] text-slate leading-[1.6] m-0">
        {firstName} is no longer in our active sponsor program.
      </p>
      <Link
        href="/children"
        className="mt-2 inline-flex items-center gap-1 text-[13px] text-tangerine-deep font-medium border-b-[1.5px] border-tangerine pb-0.5 hover:opacity-80"
      >
        Browse other children →
      </Link>
    </section>
  );
}

export default InactiveChildNotice;
