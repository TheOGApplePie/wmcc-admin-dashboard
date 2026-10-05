"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { resolveCampaignReview } from "@/actions/socialCampaigns";
import type { SocialCampaign } from "@/app/schemas/socialCampaigns";

export default function CampaignReviewPanel({ campaign, canReview }: Readonly<{ campaign: SocialCampaign; canReview: boolean }>) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const acknowledge = async () => {
    setWorking(true);
    const result = await resolveCampaignReview({campaign_id: campaign.id, version: campaign.version});
    setWorking(false);
    if (!result?.data || result.data.error) return toast.error(result?.data?.error ?? "Unable to acknowledge changes.");
    toast.success("Campaign changes acknowledged.");
    router.refresh();
  };
  return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
    <h2 className="font-semibold text-amber-900">Campaign review required</h2>
    <p className="mt-1 text-sm text-amber-800">{campaign.review_reason}</p>
    <p className="mt-2 text-sm text-amber-800">Affected posts are held as drafts. Review their content and dates, then approve each post for publishing.</p>
    {canReview && <button type="button" disabled={working} onClick={acknowledge} className="mt-3 rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white">Acknowledge campaign changes</button>}
    {!canReview && <p className="mt-3 text-xs text-amber-700">Publish permission is required to acknowledge these changes.</p>}
  </section>;
}
