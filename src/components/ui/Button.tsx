"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

// Session 16 REDO — added `white` and `outline-white` variants
// for use on the full-bleed orange-solid sections (ClosingCTA).
// "white" is a solid white pill with ink text, the inverse of
// `primary`; "outline-white" is its outline twin for secondary
// CTAs on the same backgrounds.
//
// Session 35 — WCAG AA contrast fix (Option A):
//   • `tangerine` variant: text-white → text-ink. White on tangerine
//     was 2.33:1; ink on tangerine is 5.91:1 — passes AA body text.
//     Hover bg (tangerine-deep #D97A0F) under ink is ~5:1 — also
//     passes. The visual character is unchanged: still a pill, still
//     orange, still reads as "click me" — just with dark text.
//   • `primary` variant: hover state used to be cream-on-tangerine
//     (same 2.33:1 fail). Added hover:text-ink so hover becomes
//     ink-on-tangerine. Resting state (cream-on-ink) was already
//     fine.
type Variant =
  | "primary"
  | "tangerine"
  | "outline"
  | "white"
  | "outline-white"
  // fix/donor-ui-consistency — destructive actions (Cancel / Remove /
  // Deny). `danger` is the solid red pill; `outline-danger` its ghost
  // twin (mirrors `outline`). Uses the new danger token.
  | "danger"
  | "outline-danger"
  // fix/donor-ui-consistency — tangerine ghost pill (public ghost CTA).
  | "outline-tangerine";
type Size = "default" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-ink text-cream hover:bg-tangerine hover:text-ink",
  tangerine: "bg-tangerine text-ink hover:bg-tangerine-deep",
  outline:
    "bg-transparent text-ink border-[1.5px] border-ink hover:bg-ink hover:text-cream",
  white: "bg-white text-ink hover:bg-cream",
  "outline-white":
    "bg-transparent text-white border-[1.5px] border-white hover:bg-white hover:text-ink",
  danger: "bg-danger text-cream hover:bg-danger-deep",
  "outline-danger":
    "bg-transparent text-danger border-[1.5px] border-danger hover:bg-danger hover:text-cream",
  // fix/donor-ui-consistency — the tangerine ghost pill (the public
  // site's canonical outline CTA: BrowseEmptyState / FeaturedChildren).
  // Formalized here so the dashboard's outline CTAs use the shared
  // component instead of a bespoke class string.
  "outline-tangerine":
    "bg-transparent text-tangerine-deep border-[1.5px] border-tangerine hover:bg-tangerine hover:text-ink",
};

const sizeClasses: Record<Size, string> = {
  default: "px-[22px] py-3 text-sm",
  lg: "px-8 py-[17px] text-base",
};

const baseClasses =
  "inline-flex items-center gap-2 font-body font-semibold rounded-full cursor-pointer transition-colors duration-[250ms] ease-soft border-none relative overflow-hidden";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
  };

type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * Session 16 FINAL Part 2 Item 4 — Framer Motion hover/tap.
 *
 * Motion is applied via a wrapping motion.span (or motion.button
 * for the form-button variant) so the inner Link still benefits
 * from next/link prefetching. The CSS hover transform was
 * stripped from `variantClasses` so motion's whileHover y-shift
 * doesn't fight a CSS transform on the same element.
 *
 * Reduced-motion respected via `useReducedMotion()` — skips the
 * whileHover/whileTap targets entirely so users with that
 * preference get the colour hover only.
 */
export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "default",
    className = "",
    children,
    ...rest
  } = props;
  const reduced = useReducedMotion();

  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const hoverProps = reduced
    ? {}
    : {
        whileHover: {
          y: -2,
          boxShadow: "0 6px 20px rgba(237, 139, 63, 0.25)",
        },
        whileTap: { scale: 0.98 },
        transition: { duration: 0.2 },
      };

  if ("href" in props && props.href) {
    const { href, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
    };
    // Wrap Link in motion.span so the anchor itself keeps Next's
    // prefetch behaviour. inline-block keeps the wrapper from
    // forcing a layout shift; the box-shadow on whileHover applies
    // to this wrapper so it visually surrounds the pill.
    return (
      <motion.span className="inline-block" {...hoverProps}>
        <Link href={href} className={classes} {...anchorRest}>
          {children}
        </Link>
      </motion.span>
    );
  }

  // Wrap the form-button branch in motion.span as well to avoid
  // the React/Framer onDrag type collision on motion.button.
  return (
    <motion.span className="inline-block" {...hoverProps}>
      <button
        className={classes}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    </motion.span>
  );
}

export default Button;
