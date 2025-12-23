import { createModalContext } from "@/app/hooks/createModalContext";
import { Announcement } from "@/app/schemas/announcement";

export const {
  Provider: AnnouncementModalProvider,
  useModal: useAnnouncementModal,
} = createModalContext<Announcement>();
