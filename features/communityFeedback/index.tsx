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
    <div className="flex flex-col justify-center mx-16 mt-8 gap-8">
      <div>
        <h1 className="text-3xl font-bold">Community Feedback</h1>
      </div>
      <div className="grid justify-center">
        <FeedbackTable feedback={feedback} count={count} />
      </div>
    </div>
  );
}
