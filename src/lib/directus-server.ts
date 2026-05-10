import { createDirectus, rest, staticToken } from "@directus/sdk";

// Env vars are LAZY-READ inside accessor functions. Reading at
// module load with throw breaks Next.js's build-time page-collection
// step (build imports every module — module-load throws fail the
// build before runtime env values are available). See sibling
// directus.ts for the same pattern.

function getDirectusUrl(): string {
  const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined");
  }
  return url;
}

export function getServerDirectus(token?: string) {
  const client = createDirectus(getDirectusUrl()).with(rest());
  if (token) {
    return client.with(staticToken(token));
  }
  return client;
}

export function getAdminDirectus() {
  const token = process.env.DIRECTUS_SERVER_TOKEN;
  if (!token) {
    throw new Error("DIRECTUS_SERVER_TOKEN is not defined");
  }
  return createDirectus(getDirectusUrl()).with(rest()).with(staticToken(token));
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
