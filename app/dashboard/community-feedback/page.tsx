import { CommunityFeedbackPage } from "@/features/communityFeedback";
import { fetchFeedback } from "@/features/communityFeedback/actions";

export default async function CommunityFeedback() {
  const raw = await fetchFeedback({ currentPage: 1, pageSize: 10, search: "" });
  const feedback = raw.data?.feedback ?? [];

  return (
    <CommunityFeedbackPage
      feedback={feedback}
      count={raw.data?.count ?? feedback.length}
    />
  );
}
