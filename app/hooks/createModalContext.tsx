import { ModalContextType, ModalState } from "@/features/announcements/types";
import { createContext, useContext, useMemo, useState } from "react";

export function createModalContext<T>() {
  const Context = createContext<ModalContextType<T> | null>(null);

  function Provider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [modal, setModal] = useState<ModalState<T>>({ type: "NONE" });

    const value = useMemo<ModalContextType<T>>(
      () => ({
        modal,
        openAdd:     () =>       setModal({ type: "EDIT",    entity: null }),
        openEdit:    (entity) => setModal({ type: "EDIT",    entity }),
        openDelete:  (entity) => setModal({ type: "DELETE",  entity }),
        openRestore: (entity) => setModal({ type: "RESTORE", entity }),
        close:       () =>       setModal({ type: "NONE" }),
      }),
      [modal],
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useModal() {
    const ctx = useContext(Context);
    if (!ctx) {
      throw new Error("useModal must be used within ModalProvider");
    }
    return ctx;
  }

  return { Provider, useModal };
}
