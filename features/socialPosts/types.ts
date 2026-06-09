import type { ReactNode } from "react";
import type {
  SocialPost,
  SocialChannel,
  SocialPostType,
  EventOption,
  AdminUserOption,
} from "@/app/schemas/socialPosts";

// ─── Form ─────────────────────────────────────────────────────────────────────

export interface PostFormValues {
  title:       string;
  caption:     string;
  hashtags:    string;
  channels:    SocialChannel[];
  post_type:   SocialPostType;
  post_date:   string;
  time_slot:   string;
  assigned_to: string;
  event_id:    string;
  media_url:   string;
}

// ─── Component props ──────────────────────────────────────────────────────────

export interface PostComposerProps {
  post:       SocialPost | null;
  isNew:      boolean;
  events:     EventOption[];
  allPosts:   SocialPost[];
  adminUsers: AdminUserOption[];
  onSaved:    (post: SocialPost) => void;
  onDeleted:  (id: string) => void;
}

export interface PostQueueProps {
  posts:      SocialPost[];
  selectedId: string | null;
  onSelect:   (post: SocialPost) => void;
  onMarkSent: (updated: SocialPost) => void;
}

export interface PostPreviewProps {
  channels: SocialChannel[];
  caption:  string;
  mediaUrl: string | null;
}

export interface StatCardProps {
  icon:   ReactNode;
  value:  string | number;
  label:  string;
  iconBg: string;
}

export interface SocialPostsClientProps {
  initialPosts: SocialPost[];
  events:       EventOption[];
  adminUsers:   AdminUserOption[];
}
