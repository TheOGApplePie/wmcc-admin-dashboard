import { ModalContextType, ModalState } from "@/features/announcements/types";
import { createContext, useContext, useState } from "react";

export function createModalContext<T>() {
  const Context = createContext<ModalContextType<T> | null>(null);

  function Provider({ children }: { children: React.ReactNode }) {
    const [modal, setModal] = useState<ModalState<T>>({ type: "NONE" });

    return (
      <Context.Provider
        value={{
          modal,
          openAdd: () => setModal({ type: "EDIT", entity: null }),
          openEdit: (entity) => setModal({ type: "EDIT", entity }),
          openDelete: (entity) => setModal({ type: "DELETE", entity }),
          close: () => setModal({ type: "NONE" }),
        }}
      >
        {children}
      </Context.Provider>
    );
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
