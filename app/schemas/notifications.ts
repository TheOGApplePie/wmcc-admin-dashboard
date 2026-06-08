export type NotificationType = "post_overdue" | "post_assigned";

export interface Notification {
  id: number;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: string;
  entity_id: number;
  read_at: string | null;
  created_at: string;
}
