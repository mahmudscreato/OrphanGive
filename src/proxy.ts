import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REFRESH_COOKIE = "directus_refresh_token";

export function proxy(request: NextRequest) {
  if (request.cookies.get(REFRESH_COOKIE)) {
    return NextResponse.next();
  }
  const url = new URL("/signin", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sponsor/:path*",
    "/account/:path*",
  ],
};
