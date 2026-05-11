import Image from "next/image";

/**
 * Session 16 FINAL — EyebrowIcon.
 *
 * Renders the OrphanGive favicon SVG inline as a leading
 * decoration for eyebrow labels (e.g. "Our promise",
 * "Begin today"). Replaces the ♡ heart character used in the
 * previous pass with a brand-consistent mark.
 *
 * Sized to 20px tall by default, with `w-auto` so the SVG's
 * intrinsic ~0.71:1 portrait aspect renders correctly. Marked
 * aria-hidden because it's purely decorative — the surrounding
 * eyebrow text already conveys the section topic.
 *
 * The parent element should set `inline-flex items-center` so
 * the icon + text align on the optical centerline. A small
 * `mr-1.5` margin gives the icon some breathing room from the
 * eyebrow text.
 *
 * Cloudinary `res.cloudinary.com/dh9w1apsk/**` is already in
 * `next.config.ts → images.remotePatterns`, so the URL renders
 * via next/image without additional config.
 */

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_F_SVG_x0frxm.svg";

type Props = {
  className?: string;
};

export function EyebrowIcon({ className = "" }: Props) {
  return (
    <Image
      src={FAVICON_URL}
      alt=""
      width={42}
      height={60}
      unoptimized
      aria-hidden="true"
      className={`inline-block h-5 w-auto mr-1.5 shrink-0 ${className}`}
    />
  );
}

export default EyebrowIcon;
