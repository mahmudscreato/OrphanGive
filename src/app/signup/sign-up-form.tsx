"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { COUNTRIES, COUNTRY_BY_CODE, DEFAULT_COUNTRY_CODE } from "@/lib/countries";
import { signupSchema, type SignupInput } from "@/lib/donor-signup";

const HOW_HEARD_OPTIONS = [
  { value: "search", label: "Search engine" },
  { value: "social", label: "Social media" },
  { value: "referral", label: "Referral from a friend" },
  { value: "news", label: "News article" },
  { value: "organization", label: "Organization" },
  { value: "other", label: "Other" },
] as const;

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const labelClass = "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium";
const errorClass = "mt-1.5 text-[12px] text-[#D04848]";

export function SignUpForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: "onChange",
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      country_code: DEFAULT_COUNTRY_CODE,
      phone: "",
      how_heard: undefined,
      agreed_to_safeguarding: undefined as unknown as true,
      agreed_to_terms: undefined as unknown as true,
    },
  });

  const selectedCountry = COUNTRY_BY_CODE[watch("country_code")] ?? COUNTRY_BY_CODE[DEFAULT_COUNTRY_CODE]!;

  function onSubmit(values: SignupInput) {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/donor/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const json: { success?: boolean; error?: string; email?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok || !json.success) {
          setServerError(json.error ?? "Could not create account. Please try again.");
          return;
        }
        const target = `/signup/verify?email=${encodeURIComponent(json.email ?? values.email)}`;
        router.push(target);
      } catch {
        setServerError("Network error. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-5 max-md:grid-cols-1" noValidate>
      <div className="col-span-2">
        <label className={labelClass} htmlFor="full_name">
          Full name
        </label>
        <input
          id="full_name"
          type="text"
          autoComplete="name"
          {...register("full_name")}
          className={`${inputClass} mt-2`}
          placeholder="Mahmud Khan"
        />
        {errors.full_name ? <p className={errorClass}>{errors.full_name.message}</p> : null}
      </div>

      <div className="col-span-2">
        <label className={labelClass} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email")}
          className={`${inputClass} mt-2`}
          placeholder="you@example.com"
        />
        {errors.email ? <p className={errorClass}>{errors.email.message}</p> : null}
      </div>

      <div className="col-span-2">
        <label className={labelClass} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
          className={`${inputClass} mt-2`}
          placeholder="At least 12 characters"
        />
        <p className="mt-1.5 text-[12px] text-slate-soft">
          12+ characters with at least one uppercase, lowercase, and number.
        </p>
        {errors.password ? <p className={errorClass}>{errors.password.message}</p> : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="country_code">
          Country
        </label>
        <Controller
          control={control}
          name="country_code"
          render={({ field }) => (
            <select
              id="country_code"
              {...field}
              className={`${inputClass} mt-2 appearance-none bg-white pr-10`}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.dial})
                </option>
              ))}
            </select>
          )}
        />
        {errors.country_code ? <p className={errorClass}>{errors.country_code.message}</p> : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="phone">
          Phone (with country code)
        </label>
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-3 rounded-xl bg-tangerine-mist text-tangerine-deep font-mono text-[13px] font-medium border border-ink/[0.08]">
            {selectedCountry.dial}
          </span>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            {...register("phone")}
            className={`${inputClass} flex-1`}
            placeholder="1XXXXXXXXX"
          />
        </div>
        {errors.phone ? <p className={errorClass}>{errors.phone.message}</p> : null}
      </div>

      <div className="col-span-2">
        <label className={labelClass} htmlFor="how_heard">
          How did you hear about OrphanGive?{" "}
          <span className="normal-case tracking-normal text-slate-soft font-normal">(optional)</span>
        </label>
        <select
          id="how_heard"
          {...register("how_heard")}
          className={`${inputClass} mt-2 appearance-none bg-white pr-10`}
          defaultValue=""
        >
          <option value="">— Select an option —</option>
          {HOW_HEARD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-2 mt-2 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register("agreed_to_safeguarding")}
            className="mt-1 h-4 w-4 rounded border-ink/30 text-tangerine focus:ring-tangerine-soft"
          />
          <span className="text-[14px] text-slate leading-[1.55]">
            I understand I am joining a service that protects children&apos;s
            safety and privacy. I will treat all information I receive with
            discretion.
          </span>
        </label>
        {errors.agreed_to_safeguarding ? (
          <p className={errorClass}>{errors.agreed_to_safeguarding.message}</p>
        ) : null}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register("agreed_to_terms")}
            className="mt-1 h-4 w-4 rounded border-ink/30 text-tangerine focus:ring-tangerine-soft"
          />
          <span className="text-[14px] text-slate leading-[1.55]">
            I agree to the{" "}
            <a href="/legal/terms" className="text-tangerine-deep border-b border-tangerine">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/legal/privacy" className="text-tangerine-deep border-b border-tangerine">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {errors.agreed_to_terms ? (
          <p className={errorClass}>{errors.agreed_to_terms.message}</p>
        ) : null}
      </div>

      {serverError ? (
        <div className="col-span-2 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[14px] text-[#A02B2B]">
          {serverError}
        </div>
      ) : null}

      <div className="col-span-2 mt-2 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!isValid || pending}
          className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-8 py-[15px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {pending ? "Creating account…" : "Create account →"}
        </button>
        <span className="text-[12px] text-slate-soft">
          You&apos;ll receive a 6-digit code to verify your email next.
        </span>
      </div>
    </form>
  );
}
