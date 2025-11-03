"use server";

import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../utils/supabase/server";
import { loginCredentials } from "@/app/schemas/login";
import { ResponseCodes } from "@/app/enums/responseCodes";
import { redirect, RedirectType } from "next/navigation";
import toast from "react-hot-toast";
import { isRedirectError } from "next/dist/client/components/redirect-error";

const actionClient = createSafeActionClient();

export const signUserIn = actionClient
  .inputSchema(loginCredentials)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const authTokenResponse = await supabase.auth.signInWithPassword({
        email: parsedInput.email,
        password: parsedInput.password,
      });
      if (authTokenResponse.error) {
        throw new Error(authTokenResponse.error.message);
      }
      return {
        error: "",
        data: authTokenResponse.data,
        count: 0,
        status: ResponseCodes.SUCCESS,
        statusText: "",
      };
    } catch (error) {
      console.error(error);
      return {
        error: error instanceof Error ? error.message : String(error),
        data: null,
        count: null,
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Internal Server Error",
      };
    }
  });

export const signUserOut = actionClient.action(async () => {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
    redirect("/", RedirectType.replace);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error(error);
    toast.error((error as Error).message);
  }
});
