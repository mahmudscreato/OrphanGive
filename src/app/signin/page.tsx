import { SignInForm } from "./sign-in-form";

type SearchParams = Promise<{
  next?: string | string[];
  registered?: string | string[];
  verified?: string | string[];
}>;

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = asString(params.next);
  const registered = asString(params.registered) === "1";
  const verified = asString(params.verified) === "1";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {verified ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Email verified. You can sign in now.
        </p>
      ) : null}
      {registered ? (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Account created. Check your inbox to verify your email.
        </p>
      ) : null}
      <SignInForm next={next} />
      <p className="text-sm text-zinc-600">
        Need an account?{" "}
        <a className="underline" href="/signup">
          Sign up
        </a>
      </p>
    </div>
  );
}
