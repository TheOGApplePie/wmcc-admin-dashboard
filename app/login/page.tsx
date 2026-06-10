"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LoginCredentials } from "../schemas/login";
import { EMAIL_REGEX } from "../constants/general";
import { signUserIn } from "@/actions/authentication";
import toast from "react-hot-toast";
import { redirect } from "next/navigation";
import MarqueeBackground from "./MarqueeBackground";

export default function Login() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginCredentials>({ mode: "onBlur" });
  const [hidePassword, setHidePassword] = useState(true);

  async function handleLoginSubmit(credentials: {
    email: string;
    password: string;
  }) {
    const result = await signUserIn(credentials);
    if (result.validationErrors) {
      Object.entries(result.validationErrors).forEach(([key, value]) => {
        if (value) {
          setError(
            key as keyof LoginCredentials,
            { type: "value", message: value as string },
            { shouldFocus: true },
          );
        }
      });
      return;
    }
    if (result.serverError) {
      toast.error(result.serverError);
      return;
    }
    if (result.data?.error) {
      toast.error(result.data?.error);
      return;
    }
    redirect("./dashboard");
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center">
      <MarqueeBackground />

      <main className="relative z-10 w-full max-w-sm px-4">
        {/* Card */}
        <div className="bg-surface border border-line rounded-2xl shadow-[0_8px_40px_-12px_rgba(20,32,28,.18)] p-8">
          {/* Logo + heading */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal text-[18px] font-extrabold text-white shadow-[0_8px_20px_-6px_rgba(15,128,115,.7)]">
              W
            </div>
            <div className="text-center">
              <h1 className="text-[22px] font-extrabold tracking-tight">Assalamualaikum!</h1>
              <p className="text-[13px] text-muted mt-0.5">Sign in to get started</p>
            </div>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit(handleLoginSubmit)}>
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-muted" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="rounded-xl border border-line bg-canvas px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal"
                {...register("email", {
                  required: { value: true, message: "Please enter your email" },
                  pattern: {
                    value: EMAIL_REGEX,
                    message: "Hmm, this doesn't look like a valid email...",
                  },
                })}
              />
              {errors.email && (
                <span className="text-[12px] text-coral" role="alert">
                  {errors.email.message}
                </span>
              )}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-muted" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 pr-10 text-[13px] outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal"
                  {...register("password", {
                    required: { value: true, message: "Please enter your password" },
                  })}
                  type={hidePassword ? "password" : "text"}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                  onClick={() => setHidePassword((v) => !v)}
                  aria-label={hidePassword ? "Show password" : "Hide password"}
                >
                  {hidePassword ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && (
                <span className="text-[12px] text-coral" role="alert">
                  {errors.password.message}
                </span>
              )}
            </div>

            <button
              className="mt-2 w-full rounded-xl bg-teal px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(15,128,115,.8)] transition-colors hover:bg-teal-dark active:scale-[.98]"
              type="submit"
            >
              Sign in
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
