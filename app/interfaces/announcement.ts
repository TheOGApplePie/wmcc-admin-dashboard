export interface Announcement {
  id: number;
  title: string;
  description: string;
  poster_url: string;
  poster_alt: string;
  call_to_action_link: string;
  call_to_action_caption: string;
  expires_at: Date;
  created_at: Date;
}
