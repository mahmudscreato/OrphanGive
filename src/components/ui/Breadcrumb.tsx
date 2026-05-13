import Link from "next/link";

export type Crumb = { href?: string; label: string };

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="font-mono text-[11px] tracking-[0.12em] uppercase text-slate-soft"
    >
      <ol className="flex flex-wrap items-center gap-2">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-2">
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  className="text-slate hover:text-tangerine-deeper transition-colors"
                >
                  {c.label}
                </Link>
              ) : (
                <span className={isLast ? "text-ink" : "text-slate"}>
                  {c.label}
                </span>
              )}
              {!isLast ? (
                <span aria-hidden="true" className="text-slate-soft">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
