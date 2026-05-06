import Link from "next/link";

export function EmptyState() {
  return (
    <div className="rounded-[28px] border border-ink/[0.05] bg-white px-12 py-16 text-center max-md:px-6 max-md:py-10">
      <div className="font-display text-[28px] text-ink leading-tight mb-4">
        No children match your current filters.
      </div>
      <p className="text-[15px] text-slate mb-6">
        Try widening the age range or removing a filter.
      </p>
      <div className="inline-flex flex-wrap gap-x-4 gap-y-2 justify-center font-medium text-[14px]">
        <Link
          href="/children"
          className="text-tangerine-deep border-b-[1.5px] border-tangerine pb-0.5 transition-[gap] duration-[250ms] hover:gap-3.5"
        >
          Reset filters
        </Link>
        <span className="text-slate-soft">or</span>
        <Link
          href="/children"
          className="text-tangerine-deep border-b-[1.5px] border-tangerine pb-0.5"
        >
          browse all children →
        </Link>
      </div>
    </div>
  );
}

export default EmptyState;
