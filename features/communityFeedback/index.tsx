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
    <div className="h-[calc(100dvh-4rem)] overflow-hidden flex flex-col p-6 gap-4 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold shrink-0">Community Feedback</h1>
      <FeedbackTable feedback={feedback} count={count} />
    </div>
  );
}
