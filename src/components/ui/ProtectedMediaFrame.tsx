"use client";

import type { ReactNode } from "react";

// ProtectedMediaFrame — wraps a child photo (plain <img> or Next
// <Image>) with the SAME proven right-click defence the hero
// PhotoBlob uses (via ProtectedChildImage), for the server-component
// galleries that render raw <img>/<Image> and can't attach a React
// handler themselves.
//
// WHY THIS EXISTS (the bug it fixes):
//   CSS `pointer-events: none` on an <img> is NOT enough. JS
//   hit-testing (elementFromPoint) honours it, but Chrome's NATIVE
//   context-menu hit-testing IGNORES pointer-events and still sees
//   the painted image — so "Save Image As / Copy Image / Google
//   Lens" still appears on a real right-click. (A synthetic
//   contextmenu event check gives a false pass here — don't trust
//   it.) The reliable defence is a real `onContextMenu` handler that
//   calls preventDefault(), which suppresses the whole menu. That is
//   exactly what makes the hero photo work.
//
// DEFENCE IN DEPTH (three layers):
//   1. onContextMenu → preventDefault()  — kills the context menu
//      entirely, regardless of target. (Primary; this is the part
//      the hero relies on.)
//   2. A transparent overlay painted ON TOP of the image, so even if
//      a menu did appear the topmost element under the cursor is a
//      <span>, not the <img> → no image options offered.
//   3. draggable=false + user-select/drag/iOS-callout guards (the
//      child-photo-protect class) on the image itself.
//
// HONEST SCOPE: this is a casual-save deterrent only. DevTools, the
// network tab, and screenshots still work. The real protection is the
// EXIF strip + consent gating, which are unchanged.
export function ProtectedMediaFrame({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative ${className}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {children}
      {/* Layer 2 — transparent overlay on top of the image. With
          pointer-events default (auto) it is the topmost painted +
          hit-tested element, so a right-click targets THIS span, not
          the <img> beneath it. */}
      <span aria-hidden="true" className="absolute inset-0 z-10 block" />
    </div>
  );
}

export default ProtectedMediaFrame;
