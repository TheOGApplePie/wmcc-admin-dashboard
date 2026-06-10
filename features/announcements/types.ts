export type ModalState<T> =
  | { type: "NONE" }
  | { type: "EDIT"; entity: T | null }
  | { type: "DELETE"; entity: T }
  | { type: "RESTORE"; entity: T };

export type ModalContextType<T> = {
  modal: ModalState<T>;
  openAdd: () => void;
  openEdit: (entity: T) => void;
  openDelete: (entity: T) => void;
  openRestore: (entity: T) => void;
  close: () => void;
};
