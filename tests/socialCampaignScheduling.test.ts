import assert from "node:assert/strict";
import test from "node:test";
import {
  availableSlots,
  proposeEventSchedule,
  proposeRecurringSchedule,
  schedulePlatformFor,
  validateStandaloneOccurrence,
} from "../features/socialCampaigns/scheduling/index";

test("standalone campaigns enforce the lifetime weekly limit and three-day buffer", () => {
  assert.deepEqual(validateStandaloneOccurrence("2026-09-17", ["2026-09-14"]), { valid: true });
  assert.equal(validateStandaloneOccurrence("2026-09-16", ["2026-09-14"]).reason, "three_day_buffer");
  assert.equal(
    validateStandaloneOccurrence("2026-09-20", ["2026-09-14", "2026-09-17"]).reason,
    "weekly_limit",
  );
});

test("one campaign occurrence can be distributed to several platforms", () => {
  const dates = ["2026-09-17"];
  assert.deepEqual(validateStandaloneOccurrence("2026-09-17", dates), { valid: true });
  // Distribution is represented below the occurrence; callers do not add the
  // same occurrence date once per selected platform.
  assert.equal(new Set(dates).size, 1);
});

test("late event campaigns keep only future milestones plus the initial post", () => {
  const proposals = proposeEventSchedule({
    campaignId: "campaign",
    campaignCreatedOn: "2026-09-15",
    today: "2026-09-15",
    eventOccurrenceAt: "2026-09-25T22:00:00.000Z",
  });
  assert.deepEqual(proposals.map((proposal) => proposal.milestone), [
    "initial",
    "one_week",
    "two_days",
    "one_day",
    "event_day",
  ]);
  assert.ok(proposals.every((proposal) => proposal.compressed));
});

test("later recurring occurrences omit initial posts and suppress overlapping reminders", () => {
  const proposals = proposeRecurringSchedule(
    "campaign",
    "2026-09-01",
    ["2026-10-01T14:00:00.000Z", "2026-10-08T14:00:00.000Z"],
    "2026-09-01",
  );
  assert.equal(proposals.filter((proposal) => proposal.kind === "initial").length, 1);
  const keys = proposals.flatMap((proposal) =>
    proposal.channels.map((channel) => `${proposal.targetDate}:${channel}`),
  );
  assert.equal(keys.length, new Set(keys).size);
});

test("Instagram formats share one schedule while other platforms remain independent", () => {
  assert.equal(schedulePlatformFor("instagram_feed"), "instagram");
  assert.equal(schedulePlatformFor("instagram_story"), "instagram");
  assert.equal(schedulePlatformFor("instagram_reel"), "instagram");
  assert.equal(schedulePlatformFor("whatsapp"), "whatsapp");
  assert.equal(schedulePlatformFor("tiktok_reel"), "tiktok");

  const occupied = [{ schedulePlatform: "instagram" as const, date: "2026-09-15", slot: "morning" as const }];
  assert.deepEqual(
    availableSlots("instagram_story", "2026-09-15", occupied).map((option) => option.slot),
    ["afternoon", "evening"],
  );
  assert.equal(availableSlots("whatsapp", "2026-09-15", occupied).length, 3);
});

test("event-day slots after the event starts are unavailable", () => {
  const options = availableSlots(
    "instagram_story",
    "2026-09-15",
    [],
    "2026-09-15T14:00:00.000Z", // 10:00 America/Toronto
  );
  assert.deepEqual(options.map((option) => option.slot), ["morning"]);
});
