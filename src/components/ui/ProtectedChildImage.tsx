"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactEventHandler } from "react";

/**
 * Wrapper around next/image that adds polite-defence measures to child photos:
 *
 * - Right-click suppressed (onContextMenu on the wrapper, since
 *   pointer-events:none on the img itself means events don't fire there).
 * - Drag disabled (draggable={false} + -webkit-user-drag).
 * - Selection / iOS save-link callout suppressed.
 * - pointer-events:none on the img lets clicks pass through to whatever
 *   wraps this component (e.g. a parent <Link> for card navigation).
 *
 * Session 16 FINAL Fix 1 — also handles image load errors. If the
 * underlying asset 404s or otherwise fails, we swap to the
 * `.child-photo-placeholder` (a cream→peach soft blob with a
 * small "Photo coming soon" label) instead of showing the
 * browser's broken-image icon or any other fallback. Logos NEVER
 * appear where a child's face should be.
 *
 * This is intentionally light-touch and not absolute — savvy users can still
 * grab images via DevTools. We do NOT add watermarking here.
 */
type Props = ImageProps & {
  wrapperClassName?: string;
};

export function ProtectedChildImage({
  className = "",
  wrapperClassName = "",
  alt,
  ...rest
}: Props) {
  const [errored, setErrored] = useState(false);

  const swallow: ReactEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
  };

  if (errored) {
    return (
      <div
        className={`relative w-full h-full ${wrapperClassName}`}
        onContextMenu={swallow}
        onDragStart={swallow}
      >
        <div
          className="child-photo-placeholder"
          aria-hidden="true"
          role="img"
          aria-label={typeof alt === "string" ? alt : undefined}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full ${wrapperClassName}`}
      onContextMenu={swallow}
      onDragStart={swallow}
    >
      <Image
        alt={alt}
        draggable={false}
        className={`child-photo-protect ${className}`}
        onError={() => setErrored(true)}
        {...rest}
      />
    </div>
  );
}

export default ProtectedChildImage;
