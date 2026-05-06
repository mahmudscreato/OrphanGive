"use client";

import Image, { type ImageProps } from "next/image";
import type { ReactEventHandler } from "react";

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
  const swallow: ReactEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
  };
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
        {...rest}
      />
    </div>
  );
}

export default ProtectedChildImage;
