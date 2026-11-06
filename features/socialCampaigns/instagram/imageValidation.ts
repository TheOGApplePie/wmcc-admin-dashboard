import sharp from "sharp";
import { createServiceClient } from "@/utils/supabase/serviceRole";

export class InstagramImageValidationError extends Error {}

export async function validateInstagramImageBuffer(
  bytes: Buffer,
  requirePortrait: boolean,
) {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024)
    throw new InstagramImageValidationError(
      "Instagram images must be non-empty JPEG files up to 8 MB.",
    );
  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new InstagramImageValidationError(
      "Unable to read this Instagram image. Choose a valid JPG/JPEG file.",
    );
  }
  if (metadata.format !== "jpeg")
    throw new InstagramImageValidationError(
      "Instagram images must be JPG/JPEG files. PNG and other image formats are not supported.",
    );
  // Account for EXIF rotation: validate the displayed dimensions, not just encoded axes.
  const rotated =
    metadata.orientation !== undefined && metadata.orientation >= 5;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  if (!width || !height)
    throw new InstagramImageValidationError(
      "Unable to determine Instagram image dimensions.",
    );
  if (requirePortrait && width * 5 !== height * 4) {
    throw new InstagramImageValidationError(
      `Instagram feed images must have a 4:5 aspect ratio (for example, 1080 × 1350). This image is ${width} × ${height}.`,
    );
  }
}

export async function assertInstagramImageUrl(
  value: string,
  requirePortrait: boolean,
) {
  const url = new URL(value);
  const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  const prefix = "/storage/v1/object/public/event-posters/";
  if (
    url.origin !== origin ||
    !url.pathname.startsWith(prefix) ||
    url.username ||
    url.password
  ) {
    throw new InstagramImageValidationError(
      "Choose an Instagram JPEG from this project's event-posters bucket.",
    );
  }
  const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
  const storage = createServiceClient().storage.from("event-posters");
  const { data, error } = await storage.download(objectPath);
  if (error || !data)
    throw new Error("Unable to verify the Instagram image in Storage.");
  if (data.size > 8 * 1024 * 1024)
    throw new InstagramImageValidationError(
      "Instagram images must be 8 MB or smaller.",
    );
  await validateInstagramImageBuffer(
    Buffer.from(await data.arrayBuffer()),
    requirePortrait,
  );
}
