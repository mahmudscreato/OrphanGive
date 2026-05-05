import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <SignUpForm />
      <p className="text-sm text-zinc-600">
        Already have an account?{" "}
        <a className="underline" href="/signin">
          Sign in
        </a>
      </p>
    </main>
  );
}
