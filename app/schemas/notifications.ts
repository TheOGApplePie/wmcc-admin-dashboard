export type NotificationType = "post_overdue" | "post_assigned" | "social_delivery_failed";

export interface Notification {
  id: number;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string;
  read_at: string | null;
  created_at: string;
}
