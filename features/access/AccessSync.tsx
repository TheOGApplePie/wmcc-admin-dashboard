"use client";

import { useEffect } from "react";
import { refreshViewerAccess } from "./actions";
import { accessReplaced } from "@/store/accessSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export function AccessSync() {
  const dispatch = useAppDispatch();
  const currentAccess = useAppSelector((state) => state.access);

  useEffect(() => {
    const refresh = async () => {
      try {
        const access = await refreshViewerAccess();
        const changed = JSON.stringify(access) !== JSON.stringify(currentAccess);
        if (!access.profile || access.profile.status !== "active" || changed) {
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
  }, [currentAccess, dispatch]);

  return null;
}
