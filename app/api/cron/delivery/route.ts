import { NextRequest } from "next/server";
import { runDeliveryCron } from "../_cronHandler";

export async function GET(req: NextRequest) {
  return runDeliveryCron(req);
}
