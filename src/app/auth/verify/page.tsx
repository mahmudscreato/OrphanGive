import { redirect } from "next/navigation";
import { verifyEmailToken } from "@/lib/auth";

type SearchParams = Promise<{ token?: string | string[] }>;

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function readableError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ message?: string }> }).errors;
    if (Array.isArray(errors) && errors[0]?.message) return errors[0].message;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Verification failed.";
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const token = asString((await searchParams).token);

  if (!token) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">Verification link is missing a token</h1>
        <p className="text-sm text-zinc-600">
          Open the verification link from the email you received.
        </p>
        <a className="underline text-sm" href="/signup">
          Back to sign up
        </a>
      </div>
    );
  }

  let error: string | null = null;
  try {
    await verifyEmailToken(token);
  } catch (err) {
    error = readableError(err);
  }

  if (!error) {
    redirect("/signin?verified=1");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Verification failed</h1>
      <p className="text-sm text-red-600">{error}</p>
      <p className="text-sm text-zinc-600">
        The link may have expired or already been used. Try signing up again or
        contact support.
      </p>
      <div className="flex gap-3 text-sm">
        <a className="underline" href="/signup">
          Sign up
        </a>
        <a className="underline" href="/signin">
          Sign in
        </a>
      </div>
    </div>
  );
}
