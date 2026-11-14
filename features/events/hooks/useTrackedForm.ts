"use client";
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useNavigationGuard } from "@/features/navigation/UnsavedChangesProvider";
import { formSnapshot } from "../lib/formSnapshot";

export function useTrackedForm(id: string, formRef: RefObject<HTMLFormElement | null>, busy: boolean, discard: () => void) {
  const baseline = useRef<string | null>(null);
  const discardRef = useRef(discard);
  const [dirty, setDirty] = useState(false);
  const guard = useNavigationGuard();
  const register = guard?.register;
  const commit = useCallback(() => {
    if (formRef.current) baseline.current = formSnapshot(formRef.current);
    setDirty(false);
  }, [formRef]);
  const changed = useCallback(() => {
    queueMicrotask(() => {
      if (formRef.current) setDirty(formSnapshot(formRef.current) !== baseline.current);
    });
  }, [formRef]);
  useLayoutEffect(() => { discardRef.current = discard; });
  useLayoutEffect(() => { if (formRef.current) baseline.current = formSnapshot(formRef.current); }, [formRef]);
  useLayoutEffect(() => {
    register?.(id, { dirty, busy, discard: () => { discardRef.current(); requestAnimationFrame(commit); setDirty(false); } });
    return () => register?.(id, null);
  }, [register, id, dirty, busy, commit]);
  return { dirty, changed, commit, blocked: busy || Boolean(guard?.busy),
    cancel: (action: () => void) => {
      const finish = () => { action(); requestAnimationFrame(commit); };
      if (guard) guard.request(finish, [id]); else finish();
    } };
}
