import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type Variant = "primary" | "tangerine" | "outline";
type Size = "default" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-ink text-cream hover:bg-tangerine hover:shadow-warm hover:-translate-y-px",
  tangerine:
    "bg-tangerine text-white hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px",
  outline:
    "bg-transparent text-ink border-[1.5px] border-ink hover:bg-ink hover:text-cream",
};

const sizeClasses: Record<Size, string> = {
  default: "px-[22px] py-3 text-sm",
  lg: "px-8 py-[17px] text-base",
};

const baseClasses =
  "inline-flex items-center gap-2 font-body font-semibold rounded-full cursor-pointer transition-all duration-[250ms] ease-soft border-none relative overflow-hidden";

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

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "default",
    className = "",
    children,
    ...rest
  } = props;

  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if ("href" in props && props.href) {
    const { href, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
    };
    return (
      <Link href={href} className={classes} {...anchorRest}>
        {children}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

export default Button;
