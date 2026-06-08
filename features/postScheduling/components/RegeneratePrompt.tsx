"use client";
import toast from "react-hot-toast";
import { regenerateSchedule } from "@/actions/postScheduling";

interface RegeneratePromptProps {
  eventId: number;
  campaignId: number;
  onDone: () => void;
}

export default function RegeneratePrompt({ eventId, campaignId, onDone }: RegeneratePromptProps) {
  const handleRegenerate = async () => {
    const result = await regenerateSchedule({ event_id: eventId, campaign_id: campaignId });
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      toast.success(result?.data?.statusText ?? "Schedule regenerated.");
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-base-100 rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <p className="text-lg font-semibold mb-2">Event Updated</p>
        <p className="text-sm mb-4">
          This event has an existing post schedule. Would you like to keep the current schedule
          or regenerate it based on the new event dates?
        </p>
        <div className="flex gap-3 justify-end">
          <button className="btn btn-ghost" onClick={onDone}>
            Keep Schedule
          </button>
          <button className="btn btn-warning" onClick={handleRegenerate}>
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
