// Session 48a — Desktop-only top bar with the notification bell on
// the right. Mobile already has the bell in DiHeader; this puts it
// in the desktop layout where the sidebar doesn't have a natural
// "header zone" of its own.
//
// Sticky at the top so the bell is always reachable, regardless of
// scroll position. Translucent cream backdrop matches the page.

import { NotificationBell } from "./NotificationBell";

export function DiTopBar() {
  return (
    <div
      className="hidden md:flex sticky top-0 z-20 items-center justify-end px-6 lg:px-8 py-2 bg-cream/85 backdrop-blur-sm border-b border-ink/[0.04]"
      aria-hidden={false}
    >
      <NotificationBell variant="header" />
    </div>
  );
}
