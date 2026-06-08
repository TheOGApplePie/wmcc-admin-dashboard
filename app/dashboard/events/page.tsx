"use client";
import { useState } from "react";
import EventsCalendar from "@/app/components/EventsCalendar";
import GlobalPostsCalendar from "@/features/postScheduling/components/GlobalPostsCalendar";

type Tab = "events" | "posts";

export default function Events() {
  const [tab, setTab] = useState<Tab>("events");

  return (
    <div>
      <div role="tablist" className="tabs tabs-bordered mb-6">
        <button
          role="tab"
          className={`tab text-base ${tab === "events" ? "tab-active font-semibold" : ""}`}
          onClick={() => setTab("events")}
        >
          Events
        </button>
        <button
          role="tab"
          className={`tab text-base ${tab === "posts" ? "tab-active font-semibold" : ""}`}
          onClick={() => setTab("posts")}
        >
          All Posts
        </button>
      </div>

      {tab === "events" && <EventsCalendar />}
      {tab === "posts" && <GlobalPostsCalendar />}
    </div>
  );
}
