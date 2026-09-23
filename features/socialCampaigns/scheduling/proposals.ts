import { addCalendarDays } from "./dates";
import { availableSlots, schedulePlatformFor } from "./slots";
import type { OccupiedSlot, ScheduleProposal, SocialChannel, SocialTimeSlot } from "./types";

export type PlannedProposal = ScheduleProposal & {
  suggestions: Partial<Record<SocialChannel, { date: string; slot: SocialTimeSlot }>>;
};

export type SuppressedProposalChannel = {
  reason: "overlapping_reminder" | "no_available_slot";
  channel: SocialChannel;
  targetDate: string;
  suppressedGenerationKey: string;
  retainedGenerationKey?: string;
  eventOccurrenceAt: string;
};

export function planProposalSlots(
  raw: ScheduleProposal[],
  initiallyOccupied: OccupiedSlot[],
  today: string,
): { planned: PlannedProposal[]; suppressed: SuppressedProposalChannel[] } {
  const occupied = [...initiallyOccupied];
  const reminderOwners = new Map<string, ScheduleProposal>();
  const suppressed: SuppressedProposalChannel[] = [];
  const retained: ScheduleProposal[] = [];

  for (const proposal of raw) {
    if (proposal.kind !== "reminder") {
      retained.push(proposal);
      continue;
    }
    const channels = proposal.channels.filter((channel) => {
      const key = `${proposal.targetDate}:${channel}`;
      const owner = reminderOwners.get(key);
      if (!owner) {
        reminderOwners.set(key, proposal);
        return true;
      }
      suppressed.push({
        reason: "overlapping_reminder",
        channel,
        targetDate: proposal.targetDate,
        suppressedGenerationKey: proposal.generationKey,
        retainedGenerationKey: owner.generationKey,
        eventOccurrenceAt: proposal.eventOccurrenceAt,
      });
      return false;
    });
    if (channels.length) retained.push({ ...proposal, channels });
  }

  const planned: PlannedProposal[] = [];
  for (const proposal of retained) {
    const suggestions: PlannedProposal["suggestions"] = {};
    const assignedChannels: SocialChannel[] = [];
    for (const channel of proposal.channels) {
      let candidateDate = proposal.targetDate;
      let assigned = false;
      while (candidateDate >= today) {
        const option = availableSlots(channel, candidateDate, occupied, proposal.eventOccurrenceAt)[0];
        if (option) {
          suggestions[channel] = { date: option.date, slot: option.slot };
          occupied.push({ schedulePlatform: schedulePlatformFor(channel), date: option.date, slot: option.slot });
          assignedChannels.push(channel);
          assigned = true;
          break;
        }
        candidateDate = addCalendarDays(candidateDate, -1);
      }
      if (!assigned) {
        suppressed.push({
          reason: "no_available_slot",
          channel,
          targetDate: proposal.targetDate,
          suppressedGenerationKey: proposal.generationKey,
          eventOccurrenceAt: proposal.eventOccurrenceAt,
        });
      }
    }
    if (assignedChannels.length) planned.push({ ...proposal, channels: assignedChannels, suggestions });
  }

  return { planned, suppressed };
}
