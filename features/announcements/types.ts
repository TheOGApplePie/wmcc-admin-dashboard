export type ModalState<T> =
  | { type: "NONE" }
  | { type: "EDIT"; entity: T | null }
  | { type: "DELETE"; entity: T };

export type ModalContextType<T> = {
  modal: ModalState<T>;
  openAdd: () => void;
  openEdit: (entity: T) => void;
  openDelete: (entity: T) => void;
  close: () => void;
};
