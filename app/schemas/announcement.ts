import { z } from "zod";
import { FIVE_MB } from "../constants/general";
export interface Announcement {
  id: number;
  title: string;
  description: string;
  poster_url: string | null;
  poster_alt: string;
  poster_file: File[] | null;
  call_to_action_link: string;
  call_to_action_caption: string;
  expires_at: Date | string;
  created_at: Date;
}

export const AnnouncementZod = z
  .object({
    id: z.coerce.number().optional(),
    title: z.string().trim().max(50).min(3),
    description: z.string().trim().max(100).min(20),
    poster_url: z.nullable(z.url()),
    poster_alt: z.nullable(z.string().max(100)),
    poster_file: z.array(z.file()),
    call_to_action_link: z.nullable(z.string()),
    call_to_action_caption: z.nullable(z.string().max(20)),
    expires_at: z.coerce.date(),
    created_at: z.optional(z.coerce.date()),
  })
  .superRefine((data, ctx) => {
    if (data.poster_file?.length) {
      const image = data.poster_file[0];
      if (image.size > FIVE_MB) {
        ctx.addIssue({
          code: "custom",
          message:
            "The file you are uploading is too large. Please upload an image less than 5MB.",
          path: ["poster_file"],
        });
      } else if (
        !["image/jpeg", "image/jpg", "image/png"].includes(image.type)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "The file you are uploading is of an unsupported type. Please only upload JPEG/JPG or PNG images",
          path: ["poster_file"],
        });
      }
    } else if (
      (data.poster_file?.length || data.poster_url) &&
      !data.poster_alt
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The poster alt is required when specifying a picture.",
        path: [""],
      });
    } else if (
      !data.poster_file?.length &&
      !data.poster_url &&
      data.poster_alt
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Please specify an image or remove the caption.",
        path: ["poster_url", "poster_file"],
      });
    }
    if (!data.call_to_action_link && data.call_to_action_caption) {
      ctx.addIssue({
        code: "custom",
        message: "Please specify a call to action link or remove the caption.",
        path: ["call_to_action_link"],
      });
    } else if (data.call_to_action_link && !data.call_to_action_caption) {
      ctx.addIssue({
        code: "custom",
        message: "Please specify a call to action caption or remove the link.",
        path: ["call_to_action_caption"],
      });
    }
  });
