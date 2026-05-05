import { createDirectus, rest, staticToken } from "@directus/sdk";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;

if (!url) {
  throw new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined");
}

export function getServerDirectus(token?: string) {
  const client = createDirectus(url!).with(rest());
  if (token) {
    return client.with(staticToken(token));
  }
  return client;
}

export const ACCESS_COOKIE = "directus_access_token";
export const REFRESH_COOKIE = "directus_refresh_token";

export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function cookieOptions(maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
  };
}
