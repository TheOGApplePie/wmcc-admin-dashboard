import { CommunityFeedbackPage } from "@/features/communityFeedback";
import { fetchFeedback } from "@/features/communityFeedback/actions";
import { PageShell } from "@/app/components/ui/PageShell";

export default async function CommunityFeedback() {
  const raw = await fetchFeedback({ currentPage: 1, pageSize: 10, search: "" });
  const feedback = raw.data?.feedback ?? [];

  return (
    <PageShell title="Community Feedback" subtitle="Messages submitted by community members" noPad>
      <div className="p-7 h-[calc(100dvh-73px)] overflow-hidden flex flex-col">
        <CommunityFeedbackPage
          feedback={feedback}
          count={raw.data?.count ?? feedback.length}
        />
      </div>
    </PageShell>
  );
}
