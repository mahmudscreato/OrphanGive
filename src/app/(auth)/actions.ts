"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthenticationData } from "@directus/sdk";
import {
  signIn,
  signUp,
  signOut,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from "@/lib/auth";
import {
  REFRESH_COOKIE_MAX_AGE,
  cookieOptions,
} from "@/lib/directus-server";

export type AuthFormState = { error?: string };

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  next: z.string().optional(),
});

const signUpSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  first_name: z.string().trim().min(1).optional().or(z.literal("")),
  last_name: z.string().trim().min(1).optional().or(z.literal("")),
});

function readableDirectusError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ message?: string }> }).errors;
    if (Array.isArray(errors) && errors[0]?.message) return errors[0].message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function persistTokens(data: AuthenticationData) {
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Directus did not return access/refresh tokens.");
  }
  const accessMaxAge =
    typeof data.expires === "number" && data.expires > 0
      ? Math.floor(data.expires / 1000)
      : 60 * 15;
  const store = await cookies();
  store.set(ACCESS_COOKIE, data.access_token, cookieOptions(accessMaxAge));
  store.set(
    REFRESH_COOKIE,
    data.refresh_token,
    cookieOptions(REFRESH_COOKIE_MAX_AGE),
  );
}

// fix/remove-approval-wall — establish a donor session WITHOUT redirecting, so
// the caller controls navigation. Used by /signup/verify to auto-sign-in a
// just-verified donor (with the password they set at signup) and resume the
// origin child flow. Sets the same session cookies as signInAction; returns a
// result instead of redirecting (avoids server-action-redirect ambiguity in an
// imperative client call).
export async function establishSession(
  email: string,
  password: string,
): Promise<{ ok: true } | { error: string }> {
  let tokens: AuthenticationData;
  try {
    tokens = await signIn(email, password);
  } catch (err) {
    return { error: readableDirectusError(err, "Sign-in failed.") };
  }
  await persistTokens(tokens);
  return { ok: true };
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let tokens: AuthenticationData;
  try {
    tokens = await signIn(parsed.data.email, parsed.data.password);
  } catch (err) {
    return { error: readableDirectusError(err, "Sign-in failed.") };
  }

  await persistTokens(tokens);
  redirect(parsed.data.next || "/dashboard");
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    first_name: formData.get("first_name") ?? undefined,
    last_name: formData.get("last_name") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await signUp(parsed.data.email, parsed.data.password, {
      first_name: parsed.data.first_name || undefined,
      last_name: parsed.data.last_name || undefined,
    });
  } catch (err) {
    return { error: readableDirectusError(err, "Sign-up failed.") };
  }

  redirect("/signin?registered=1");
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  await signOut(refreshToken);
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  redirect("/signin");
}
