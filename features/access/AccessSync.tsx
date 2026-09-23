"use client";

import { useEffect } from "react";
import { refreshViewerAccess } from "./actions";
import { accessReplaced } from "@/store/accessSlice";
import { useAppDispatch } from "@/store/hooks";

export function AccessSync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const refresh = async () => {
      try {
        const access = await refreshViewerAccess();
        if (!access.profile || access.profile.status !== "active") {
          window.location.reload();
          return;
        }
        dispatch(accessReplaced(access));
      } catch (error) {
        console.error("Unable to refresh dashboard access", error);
      }
    };
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [dispatch]);

  return null;
}
