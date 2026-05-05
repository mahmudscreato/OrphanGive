import { cookies } from "next/headers";
import {
  login,
  logout,
  readMe,
  refresh,
  registerUser,
  registerUserVerify,
  type AuthenticationData,
} from "@directus/sdk";
import { directus } from "./directus";
import { ACCESS_COOKIE, REFRESH_COOKIE, getServerDirectus } from "./directus-server";

export type DonorProfile = {
  first_name?: string;
  last_name?: string;
};

const USER_FIELDS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "status",
  "role",
] as const;

export type CurrentUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  role: string | null;
};

export async function signIn(
  email: string,
  password: string,
): Promise<AuthenticationData> {
  return directus.request(login({ email, password }, { mode: "json" }));
}

export async function signUp(
  email: string,
  password: string,
  donorProfile: DonorProfile = {},
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const verification_url = siteUrl ? `${siteUrl}/auth/verify` : undefined;
  await directus.request(
    registerUser(email, password, {
      ...(verification_url ? { verification_url } : {}),
      ...(donorProfile.first_name ? { first_name: donorProfile.first_name } : {}),
      ...(donorProfile.last_name ? { last_name: donorProfile.last_name } : {}),
    }),
  );
}

export async function signOut(refreshToken?: string): Promise<void> {
  if (!refreshToken) return;
  try {
    await directus.request(
      logout({ refresh_token: refreshToken, mode: "json" }),
    );
  } catch {
    // Token may already be invalid; cookies are cleared by the caller regardless.
  }
}

export async function refreshSession(
  refreshToken: string,
): Promise<AuthenticationData> {
  return directus.request(
    refresh({ refresh_token: refreshToken, mode: "json" }),
  );
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;
  try {
    const client = getServerDirectus(accessToken);
    const me = await client.request(
      readMe({ fields: [...USER_FIELDS] }),
    );
    return me as CurrentUser;
  } catch {
    // TODO: when access token is expired but refresh cookie is still valid,
    // exchange it via a route handler / server action and retry. cookies().set()
    // is not allowed during Server Component render, so refresh has to happen
    // in a mutation context.
    return null;
  }
}

export async function verifyEmailToken(token: string): Promise<void> {
  await directus.request(registerUserVerify(token));
}

export async function requestEmailVerification(_email: string): Promise<void> {
  void _email;
  throw new Error(
    "requestEmailVerification is not implemented — add a Directus Flow for resends.",
  );
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
