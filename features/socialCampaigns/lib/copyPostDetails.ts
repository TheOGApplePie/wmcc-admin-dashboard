import { z } from "zod";
import { SocialMediaItemZod } from "@/app/schemas/socialCampaigns";

export const COPY_FIELDS = {
  caption: "Caption / message",
  media_items: "Media and alt text",
  hashtags: "Hashtags",
} as const;
export type CopyField = keyof typeof COPY_FIELDS;
export const CopyDetailsZod = z.object({
  caption: z.string().max(2200),
  media_items: z.array(SocialMediaItemZod).max(10),
  hashtags: z.array(z.string().min(1).max(100)).max(30),
});
export const CopyPostDetailsZod = z
  .object({
    source_id: z.uuid(),
    campaign_id: z.uuid(),
    fields: z
      .array(z.enum(Object.keys(COPY_FIELDS) as [CopyField, ...CopyField[]]))
      .min(1),
    details: CopyDetailsZod.partial(),
    targets: z
      .array(z.object({ id: z.uuid(), version: z.number().int().positive() }))
      .min(1)
      .max(500),
  })
  .superRefine((input, ctx) => {
    if (input.fields.some((field) => input.details[field] === undefined))
      ctx.addIssue({
        code: "custom",
        message: "Provide every selected field.",
      });
    const ids = input.targets.map((target) => target.id);
    if (ids.includes(input.source_id) || new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Select other posts without duplicates.",
      });
  });
export function selectCopyDetails(
  details: z.infer<typeof CopyDetailsZod>,
  fields: CopyField[],
) {
  return Object.fromEntries(fields.map((field) => [field, details[field]]));
}
