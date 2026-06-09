"use client";

import { useState, useRef } from "react";
import toast from "react-hot-toast";
import { SocialChannel, IG_STORY_RATIO } from "@/app/schemas/socialPosts";
import { uploadSocialPostMedia } from "@/actions/socialPosts";

// Three exact aspect ratios Instagram Feed accepts, with ±5% tolerance.
const IG_FEED_ALLOWED_RATIOS = [
  { label: "4:5 portrait (1080×1350)",    ratio: 4 / 5 },
  { label: "1:1 square (1080×1080)",      ratio: 1     },
  { label: "1.91:1 landscape (1080×566)", ratio: 1.91  },
];
const IG_FEED_RATIO_TOLERANCE = 0.05;

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "video/mp4"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function validateImageRatio(file: File, channels: SocialChannel[]): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null; // video — skip ratio check
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) { resolve(null); return; }
      const ratio = w / h;

      if (channels.includes("ig_story") && ratio > IG_STORY_RATIO.max) {
        resolve(
          `IG Story requires a 9:16 vertical image (ratio ≤ 0.64). ` +
          `Your image is ${w}×${h}px (ratio ${ratio.toFixed(2)}).`,
        );
        return;
      }

      if (channels.includes("ig_feed") && !channels.includes("ig_story")) {
        const match = IG_FEED_ALLOWED_RATIOS.find(
          (r) => Math.abs(ratio - r.ratio) <= IG_FEED_RATIO_TOLERANCE,
        );
        if (!match) {
          resolve(
            `IG Feed requires one of: 4:5 portrait (1080×1350), 1:1 square (1080×1080), ` +
            `or 1.91:1 landscape (1080×566). ` +
            `Your image is ${w}×${h}px (ratio ${ratio.toFixed(2)}).`,
          );
          return;
        }
      }

      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

interface UseMediaUploadOptions {
  channels:   SocialChannel[];
  onUploaded: (url: string) => void;
}

export function useMediaUpload({ channels, onUploaded }: UseMediaUploadOptions) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearUploadError = () => setUploadError(null);

  const resetInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (file.size > MAX_FILE_BYTES) {
      setUploadError("File too large — max 10 MB.");
      resetInput();
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError("Unsupported file type — use JPEG, PNG, WebP, or MP4.");
      resetInput();
      return;
    }
    const ratioError = await validateImageRatio(file, channels);
    if (ratioError) {
      setUploadError(ratioError);
      resetInput();
      return;
    }

    setUploading(true);
    const result = await uploadSocialPostMedia({ file });
    setUploading(false);

    if (result?.data?.error) {
      setUploadError(result.data.error);
      resetInput();
      return;
    }
    if (result?.data?.data?.media_url) {
      onUploaded(result.data.data.media_url);
      toast.success("Media uploaded.");
    }
    resetInput();
  };

  return { uploadError, uploading, fileInputRef, handleFileChange, clearUploadError };
}
