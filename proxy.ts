import { NextRequest, NextResponse } from "next/server";
import { createClient } from "./utils/supabase/server";

export async function proxy(request: NextRequest) {
  const supabase = await createClient();
  const user = await supabase.auth.getUser();

  if (!user.data.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*"] };
