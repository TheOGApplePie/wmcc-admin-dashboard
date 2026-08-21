"use server";

import { getViewerAccess } from "./server";

export async function refreshViewerAccess() {
  return getViewerAccess();
}
