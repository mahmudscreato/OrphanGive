import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "directus_access_token";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;

  if (token) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const from = `${pathname}${search}`;
  const signInUrl = new URL("/signin", request.url);
  signInUrl.searchParams.set("from", from);

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/sponsor",
    "/sponsor/:path*",
    "/account",
    "/account/:path*",
  ],
};
