import { NextRequest } from "next/server";
import { runCronSlot } from "../_cronHandler";

export async function GET(req: NextRequest) {
  return runCronSlot(req, "evening");
}
