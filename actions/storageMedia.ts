"use server";

import { z } from "zod";
import { createSafeActionClient } from "next-safe-action";
import { requirePermission } from "@/utils/permissions";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { ok, fail } from "@/utils/actionResponse";

const ListStorageZod = z.object({
  context: z.enum(["social", "announcements", "events"]),
  bucket: z.enum(["event-posters", "videos"]),
  prefix: z.string().max(500).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\]*$/, "Invalid storage folder.").default(""),
  offset: z.number().int().min(0).max(10_000).default(0),
});

const actionClient = createSafeActionClient();

export const listStorageMedia = actionClient
  .inputSchema(ListStorageZod)
  .action(async ({ parsedInput }) => {
    try {
      await requirePermission(parsedInput.context, "edit");
      const service = createServiceClient();
      const { data, error } = await service.storage
        .from(parsedInput.bucket)
        .list(parsedInput.prefix, {
          limit: 60,
          offset: parsedInput.offset,
          sortBy: { column: "name", order: "asc" },
        });
      if (error) throw new Error(error.message);

      const entries = (data ?? []).map((entry) => {
        const path = parsedInput.prefix ? `${parsedInput.prefix}/${entry.name}` : entry.name;
        const isFolder = entry.id === null;
        return {
          name: entry.name,
          path,
          isFolder,
          mimeType: isFolder ? null : String(entry.metadata?.mimetype ?? ""),
          size: isFolder ? null : Number(entry.metadata?.size ?? 0),
          url: isFolder ? null : service.storage.from(parsedInput.bucket).getPublicUrl(path).data.publicUrl,
        };
      });
      return ok({ entries, hasMore: entries.length === 60 });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to browse media.");
    }
  });


const UploadStorageZod = ListStorageZod.omit({ offset: true }).extend({
  name: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/jpg", "image/png", "video/mp4"]),
  size: z.number().int().positive(),
  mediaKind: z.enum(["image", "instagram_image", "video", "image_or_video"]),
}).superRefine((input, ctx) => {
  const video = input.contentType.startsWith("video/");
  if (video !== (input.bucket === "videos")) {
    ctx.addIssue({ code: "custom", message: "Choose the matching image or video bucket.", path: ["bucket"] });
  }
  if (input.mediaKind === "instagram_image" && input.contentType !== "image/jpeg") {
    ctx.addIssue({ code: "custom", message: "Instagram images must be JPEG files.", path: ["contentType"] });
  }
  if ((input.mediaKind === "image" && video) || (input.mediaKind === "video" && !video)) {
    ctx.addIssue({ code: "custom", message: "This file does not match the required media type.", path: ["contentType"] });
  }
  const limit = video ? 50 : 5;
  if (input.size > limit * 1024 * 1024) {
    ctx.addIssue({ code: "custom", message: `File must be ${limit} MB or smaller.`, path: ["size"] });
  }
});

export const prepareStorageUpload = actionClient.inputSchema(UploadStorageZod).action(async ({ parsedInput }) => {
  try {
    await requirePermission(parsedInput.context, "edit");
    const extensions = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "video/mp4": "mp4" };
    const base = parsedInput.name.replace(/\.[^.]+$/, "").replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "media";
    const name = `${base}-${crypto.randomUUID()}.${extensions[parsedInput.contentType]}`;
    const path = [parsedInput.prefix, name].filter(Boolean).join("/");
    const storage = createServiceClient().storage.from(parsedInput.bucket);
    const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
    if (error) throw new Error(error.message);
    return ok({ path, token: data.token, url: storage.getPublicUrl(path).data.publicUrl });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to prepare upload.");
  }
});
