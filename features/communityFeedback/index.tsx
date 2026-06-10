import { CommunityFeedback } from "@/app/schemas/communityFeedback";
import FeedbackTable from "./components/feedbackTable";

export function CommunityFeedbackPage({
  feedback,
  count,
}: Readonly<{
  feedback: CommunityFeedback[];
  count: number;
}>) {
  return (
    <div className="h-[calc(100dvh-4.5rem)] overflow-hidden flex flex-col gap-4">
      <FeedbackTable feedback={feedback} count={count} />
    </div>
  );
}
