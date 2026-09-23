"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { resolveCampaignReview } from "@/actions/socialCampaigns";
import type { SocialCampaignReview } from "@/app/schemas/socialCampaigns";

export default function CampaignReviewPanel({ review, canReview }: Readonly<{ review: SocialCampaignReview; canReview: boolean }>) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const decide = async (decision: "keep_post" | "regenerate_post" | "keep_all" | "regenerate_all", postId: string | null = null) => {
    if (!canReview) return;
    const destructive = decision.startsWith("regenerate");
    if (destructive && !window.confirm("Regenerate the selected future content? Posted content will remain unchanged.")) return;
    setWorking(true);
    const result = await resolveCampaignReview({ review_id: review.id, decision, post_id: postId });
    setWorking(false);
    if (result?.data?.error) return toast.error(result.data.error);
    toast.success("Review verdict saved.");
    router.refresh();
  };

  const unresolved = review.social_post_review_items.filter((item) => item.decision === "unresolved");
  const itemDetail = (item: SocialCampaignReview["social_post_review_items"][number]) => {
    if (item.proposed_state.reason === "no_available_slot") {
      return `No ${String(item.proposed_state.channel ?? "platform")} slot was available on or before ${String(item.proposed_state.targetDate ?? "the milestone date")}.`;
    }
    return item.detail;
  };
  return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold text-amber-900">Schedule review required</h2><p className="mt-1 text-sm text-amber-800">{review.reason}</p></div>
      {canReview && <div className="flex gap-2"><button type="button" disabled={working} onClick={() => decide("keep_all")} className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900">Keep all</button><button type="button" disabled={working} onClick={() => decide("regenerate_all")} className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white">Regenerate all</button></div>}
    </div>
    <div className="mt-4 space-y-2">{unresolved.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3"><div><p className="text-sm font-semibold text-ink">{item.previous_state.title ?? "Affected post"}</p><p className="text-xs text-muted">{itemDetail(item)}</p></div>{canReview && item.post_id && <div className="flex gap-2"><button type="button" disabled={working} onClick={() => decide("keep_post", item.post_id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">Keep</button><button type="button" disabled={working} onClick={() => decide("regenerate_post", item.post_id)} className="rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-900">Regenerate</button></div>}</div>)}</div>
    {!canReview && <p className="mt-3 text-xs text-amber-700">You can view this review, but social review permission is required to render a verdict.</p>}
  </section>;
}
