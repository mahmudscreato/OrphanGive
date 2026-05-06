"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export function LoadMore({ nextPage }: { nextPage: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="mt-12 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 font-body font-semibold rounded-full px-7 py-3 text-sm border-[1.5px] border-ink text-ink transition-all duration-[250ms] ease-soft hover:bg-ink hover:text-cream disabled:opacity-60 disabled:cursor-progress"
      >
        {pending ? "Loading…" : "Load more children"}
      </button>
    </div>
  );
}

export default LoadMore;
