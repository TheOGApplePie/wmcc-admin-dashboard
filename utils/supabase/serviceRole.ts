import { createClient } from "@supabase/supabase-js";

// Service-role client bypasses Row Level Security.
// ONLY import this from app/api/cron/* route handlers — never from UI code.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
