import { createClient } from "@/utils/supabase/server";
import { redirect, RedirectType } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard", RedirectType.replace);
  } else {
    redirect("/login", RedirectType.replace);
  }
}
