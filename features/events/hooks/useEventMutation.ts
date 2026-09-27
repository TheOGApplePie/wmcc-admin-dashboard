"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { assertResponse } from "../lib/formUtilities";
import type { ActionResponse } from "../lib/formUtilities";

type Task = () => Promise<ActionResponse>;

export function useEventMutation() {
  const router = useRouter();
  const lock = useRef(false);
  const [working, setWorking] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState("");
  async function run(task: Task, after?: () => void) {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setError("");
    try {
      assertResponse(await task());
      toast.success("Changes saved.");
      after?.();
      startRefresh(() => router.refresh());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The change could not be saved. Please retry.",
      );
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  return { run, busy: working || refreshing, error };
}
