export interface CommunityFeedback {
  id: number;
  name: string; // text not null,
  email: string; // text not null,
  telephone: string; // text null,
  message: string; // text not null,
  created_at: Date;
}
