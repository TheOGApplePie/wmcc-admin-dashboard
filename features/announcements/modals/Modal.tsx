"use client";

import { type ComponentRef, createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const DismissGuardContext = createContext<{ current: (() => boolean) | null } | null>(null);

export function useModalDismissGuard(guard: () => boolean) {
  const ref = useContext(DismissGuardContext);
  useLayoutEffect(() => {
    if (!ref) return;
    ref.current = guard;
    return () => { ref.current = null; };
  }, [ref, guard]);
}

export function Modal({ children, onClose, busy = false }: Readonly<{ children: React.ReactNode; onClose: () => void; busy?: boolean }>) {
  const dismissGuard = useRef<(() => boolean) | null>(null);
  const dialogRef = useRef<ComponentRef<"dialog">>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  if (typeof document === "undefined") return null;
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

  return createPortal(
    <DismissGuardContext.Provider value={dismissGuard}><dialog ref={dialogRef} className="modal" onCancel={(event) => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      if (!busy && (!dismissGuard.current || dismissGuard.current())) onClose();
    }} onClose={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {children}
    </dialog></DismissGuardContext.Provider>,
    modalRoot,
  );
}
