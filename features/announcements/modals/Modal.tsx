"use client";

import { type ComponentRef, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function Modal({ children }: Readonly<{ children: React.ReactNode }>) {
  const dialogRef = useRef<ComponentRef<"dialog">>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  if (typeof document === "undefined") return null;
  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) return null;

  function onDismiss() {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }

  return createPortal(
    <dialog ref={dialogRef} className="modal" onClose={onDismiss}>
      {children}
    </dialog>,
    modalRoot,
  );
}
