"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Entry = { dirty: boolean; busy: boolean; discard: () => void };
type Guard = {
  busy: boolean;
  navigate: (href: string, replace?: boolean) => void;
  register: (id: string, entry: Entry | null) => void;
  request: (action: () => void, scope?: string[]) => void;
};
const Context = createContext<Guard | null>(null);
export function useNavigationGuard() { return useContext(Context); }

export function UnsavedChangesProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const navigate = (href: string, replace = false) => startNavigation(() => {
    if (replace) router.replace(href); else router.push(href);
  });
  const entries = useRef(new Map<string, Entry>());
  const [snapshot, setSnapshot] = useState<Map<string, Entry>>(() => new Map());
  const [pending, setPending] = useState<{ action: () => void; scope?: string[] } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const register = useCallback((id: string, entry: Entry | null) => {
    if (entry) entries.current.set(id, entry); else entries.current.delete(id);
    setSnapshot(new Map(entries.current));
  }, []);
  const busy = navigating || [...snapshot.values()].some((entry) => entry.busy);
  const dirty = [...snapshot.values()].some((entry) => entry.dirty);
  const request = useCallback((action: () => void, scope?: string[]) => {
    if (navigating || [...entries.current.values()].some((entry) => entry.busy)) return;
    const affected = [...entries.current].filter(([id]) => !scope || scope.includes(id));
    if (affected.some(([, entry]) => entry.dirty)) setPending({ action, scope });
    else action();
  }, [navigating]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);
  useEffect(() => {
    if (!pending) return;
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    keep.current?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [pending]);
  return <Context.Provider value={{ busy, register, request, navigate }}>
    {children}
    {pending && <dialog ref={dialog} aria-labelledby="discard-title" aria-describedby="discard-description"
      onCancel={(event) => { event.preventDefault(); if (!busy) setPending(null); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/50">
      <h2 id="discard-title" className="text-lg font-bold">Discard unsaved changes?</h2>
      <p id="discard-description" className="mt-3 text-sm">You have changes that haven&apos;t been saved. Leaving will discard them.</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button ref={keep} type="button" disabled={busy} onClick={() => setPending(null)} className="rounded-xl border border-line px-4 py-2 text-sm">Keep editing</button>
        <button type="button" disabled={busy} className="rounded-xl bg-coral px-4 py-2 text-sm font-semibold text-white" onClick={() => {
          if ([...entries.current.values()].some((entry) => entry.busy)) return;
          for (const [id, entry] of entries.current) if (!pending.scope || pending.scope.includes(id)) entry.discard();
          const action = pending.action;
          setPending(null);
          action();
        }}>Discard changes</button>
      </div>
    </dialog>}
  </Context.Provider>;
}

export function GuardedLink(props: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  const guard = useNavigationGuard();
  return <Link {...props} onNavigate={(event) => {
    let prevented = false;
    props.onNavigate?.({ preventDefault: () => { prevented = true; event.preventDefault(); } });
    if (prevented || !guard) return;
    event.preventDefault();
    const href = props.href;
    if (href) guard.request(() => guard.navigate(href, props.replace));
  }} />;
}
