"use client";

import { type ComponentRef, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Modal({ children }: { children: React.ReactNode }) {
  const dialogRef = useRef<ComponentRef<"dialog">>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (mounted && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current?.showModal();
    }
  }, [mounted]);
  const modalRoot = document.getElementById("modal-root");
  if (!mounted || !modalRoot) return null;

  function onDismiss() {
    if (dialogRef.current?.open) {
      dialogRef.current?.close();
    }
  }

  return createPortal(
    <dialog ref={dialogRef} className="modal" onClose={onDismiss}>
      {children}
    </dialog>,
    modalRoot
  );
}
