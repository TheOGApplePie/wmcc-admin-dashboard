"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LoginCredentials } from "../schemas/login";
import { EMAIL_REGEX } from "../constants/general";
import { signUserIn } from "@/actions/authentication";
import toast from "react-hot-toast";
import { redirect } from "next/navigation";

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
    <div className="z-30 flex min-h-dvh items-center justify-center ">
      <main className="flex flex-col items-center justify-between">
        <div className="rounded-2xl hero bg-base-200 py-32 px-16">
          <div className="hero-content text-center ">
            <div className="max-w-md">
              <h1 className="font-bold">Assalamualaikum!</h1>
              <h2>Sign in to get started!</h2>
              <form
                className="grid gap-3 py-3"
                onSubmit={handleSubmit(handleLoginSubmit)}
              >
                <label className="input w-full" htmlFor="email">
                  <span className="label">Email</span>
                  <input
                    {...register("email", {
                      required: {
                        value: true,
                        message: "Please enter your email",
                      },
                      pattern: {
                        value: EMAIL_REGEX,
                        message: "Hmm, this doesn't look like a valid email...",
                      },
                    })}
                  />
                </label>
                {errors.email && (
                  <span className="text-red-600" role="alert">
                    {errors.email.message}
                  </span>
                )}
                <label className="input w-full" htmlFor="password">
                  <span className="label">Password</span>
                  <input
                    {...register("password", {
                      required: {
                        value: true,
                        message: "Please enter your password ",
                      },
                    })}
                    type={hidePassword ? "password" : "text"}
                  />
                  <label className="swap">
                    <input
                      className="hover:cursor-pointer transition-all duration-1000"
                      type="checkbox"
                      onChange={(event) => {
                        setHidePassword(!event.target.checked);
                      }}
                    />
                    <svg
                      className="swap-off fill-current"
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1.688 8.306a1 1 0 1 1 1.624-1.167c.304.423.773.827 1.38 1.177C5.985 9.062 7.777 9.5 9.704 9.5c1.928 0 3.72-.437 5.013-1.184.607-.35 1.076-.754 1.38-1.177a1 1 0 1 1 1.624 1.167c-.48.669-1.164 1.257-2.004 1.742-1.612.93-3.748 1.452-6.013 1.452s-4.4-.522-6.012-1.452c-.84-.485-1.524-1.073-2.004-1.742"
                        fill="#000"
                      />
                      <path
                        d="M11 11a1 1 0 1 0-2 0v2.5a1 1 0 1 0 2 0zm-5.47-.242a1 1 0 0 1 1.94.485l-.5 2a1 1 0 1 1-1.94-.486zm8.44 0a1 1 0 0 0-1.94.485l.5 2a1 1 0 1 0 1.94-.486zm2.555-2.465a1 1 0 1 0-1.414 1.414l2 2a1 1 0 0 0 1.414-1.414zm-13.447.034a1 1 0 0 1 1.48 1.346l-1.818 2a1 1 0 1 1-1.48-1.346z"
                        fill="#000"
                      />
                    </svg>

                    <svg
                      className="swap-on fill-current"
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M10 16.5c4.897 0 9-2.308 9-5.5s-4.103-5.5-9-5.5S1 7.808 1 11s4.103 5.5 9 5.5m0-9c3.94 0 7 1.722 7 3.5s-3.06 3.5-7 3.5-7-1.722-7-3.5 3.06-3.5 7-3.5"
                        fill="#000"
                      />
                      <path
                        d="M9 3.5a1 1 0 0 1 2 0v3a1 1 0 1 1-2 0zm4.02.304a1 1 0 0 1 1.96.392l-.5 2.5a1 1 0 1 1-1.96-.392zm-6.04 0a1 1 0 0 0-1.96.392l.5 2.5a1 1 0 0 0 1.96-.392zM2.858 4.986a1 1 0 1 0-1.715 1.029l1.5 2.5a1 1 0 1 0 1.715-1.03zm14.285 0a1 1 0 0 1 1.715 1.029l-1.5 2.5a1 1 0 1 1-1.716-1.03z"
                        fill="#000"
                      />
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M10 14a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m0-5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3"
                        fill="#000"
                      />
                    </svg>
                  </label>
                </label>
                {errors.password && (
                  <span className="text-red-600" role="alert">
                    {errors.password.message}
                  </span>
                )}
                <button className="btn btn-soft" type="submit">
                  Login
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
