"use client";
import Pagination from "@/app/components/pagination";
import { CommunityFeedback } from "@/app/schemas/communityFeedback";
import { Avatar } from "@/app/components/ui/Avatar";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { fetchFeedback } from "../actions";

type FilterForm = {
  search: string;
  startDate: string;
  endDate: string;
  currentPage: number;
  pageSize: number;
};

function fmtDate(dateStr: string | Date) {
  return new Date(dateStr).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  });
}

function fmtRelative(dateStr: string | Date): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Input field shared style ─────────────────────────────────────────────────
const INPUT_CLS =
  "rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal";

export default function FeedbackTable({
  feedback,
  count,
}: Readonly<{
  feedback: CommunityFeedback[];
  count: number;
}>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    resetField,
    control,
    setValue,
  } = useForm<FilterForm>({
    defaultValues: {
      search: "", startDate: "", endDate: "",
      currentPage: 1, pageSize: 10,
    },
    mode: "onChange",
  });

  const startDate   = useWatch({ control, name: "startDate" });
  const endDate     = useWatch({ control, name: "endDate" });
  const pageSize    = useWatch({ control, name: "pageSize" });
  const currentPage = useWatch({ control, name: "currentPage" });

  const [totalCount, setTotalCount] = useState(count);
  const [items, setItems]           = useState(feedback);
  const [selected, setSelected]     = useState<CommunityFeedback | null>(null);
  const [loading, setLoading]       = useState(false);

  async function onSubmit(data: FilterForm) {
    setLoading(true);
    const result = await fetchFeedback({
      search: data.search,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      currentPage: data.currentPage,
      pageSize: data.pageSize,
    });
    setItems(result.data?.feedback ?? []);
    setTotalCount(result.data?.count ?? 0);
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ── Filters ────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="shrink-0 flex flex-wrap gap-3 items-end"
      >
        {/* Search */}
        <div className="flex-1 min-w-48">
          <label className="block text-[11px] font-semibold text-muted mb-1" htmlFor="search">
            Search
          </label>
          <div className="flex gap-2">
            <input
              id="search"
              type="search"
              className={`${INPUT_CLS} flex-1`}
              placeholder="Search by message or name…"
              {...register("search")}
            />
            <button
              type="submit"
              className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-teal text-white hover:bg-teal-dark transition-colors"
            >
              Search
            </button>
          </div>
        </div>

        {/* From */}
        <div>
          <label className="block text-[11px] font-semibold text-muted mb-1" htmlFor="startDate">
            From
          </label>
          <div className="flex gap-1">
            <input
              id="startDate"
              type="date"
              className={INPUT_CLS}
              {...register("startDate", {
                validate: {
                  beforeEnd: (v, { endDate: e }) =>
                    !v || !e || new Date(v) <= new Date(e) || "From must be before To",
                },
              })}
            />
            {startDate && (
              <button
                type="button"
                className="px-2 py-2 rounded-xl border border-line text-muted hover:text-coral hover:border-coral transition-colors text-[12px]"
                onClick={() => resetField("startDate")}
                aria-label="Clear from date"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* To */}
        <div>
          <label className="block text-[11px] font-semibold text-muted mb-1" htmlFor="endDate">
            To
          </label>
          <div className="flex gap-1">
            <input
              id="endDate"
              type="date"
              className={INPUT_CLS}
              {...register("endDate", {
                validate: {
                  afterStart: (v, { startDate: s }) =>
                    !v || !s || new Date(v) >= new Date(s) || "To must be after From",
                },
              })}
            />
            {endDate && (
              <button
                type="button"
                className="px-2 py-2 rounded-xl border border-line text-muted hover:text-coral hover:border-coral transition-colors text-[12px]"
                onClick={() => resetField("endDate")}
                aria-label="Clear to date"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="px-4 py-2 text-[13px] font-semibold rounded-xl border border-line hover:border-teal hover:text-teal transition-colors"
        >
          Apply
        </button>
      </form>

      {(errors.startDate || errors.endDate) && (
        <p className="shrink-0 text-[12px] text-coral -mt-2">
          {errors.startDate?.message ?? errors.endDate?.message}
        </p>
      )}

      {/* ── Two-column inbox layout ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex gap-5 overflow-hidden">

        {/* Inbox list */}
        <div className="flex flex-col flex-1 min-w-0 bg-surface border border-line rounded-2xl overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 bg-surface/70 flex items-center justify-center z-20 rounded-2xl">
              <span className="loading loading-spinner loading-md" />
            </div>
          )}

          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-line bg-canvas">
            <span className="text-[12px] font-semibold text-muted">
              {totalCount} {totalCount === 1 ? "message" : "messages"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-line">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 opacity-40 gap-2">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-[13px]">No feedback found.</p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-canvas ${
                    selected?.id === item.id ? "bg-teal-soft/40" : ""
                  }`}
                  onClick={() => setSelected(item)}
                >
                  <Avatar name={item.name} size={36} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold truncate">{item.name}</span>
                      <span className="text-[10px] text-muted shrink-0">{fmtRelative(item.created_at)}</span>
                    </div>
                    <p className="text-[12px] text-muted line-clamp-2 mt-0.5">{item.message}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {totalCount > pageSize && (
            <div className="shrink-0 px-4 py-3 border-t border-line">
              <Pagination
                currentPage={currentPage}
                total={totalCount}
                limit={pageSize}
                onPageChange={(page, newPageSize) => {
                  setValue("currentPage", page);
                  if (newPageSize) setValue("pageSize", newPageSize);
                  handleSubmit((data) =>
                    onSubmit({ ...data, pageSize: newPageSize ?? pageSize, currentPage: page }),
                  )();
                }}
              />
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="w-[340px] shrink-0 bg-surface border border-line rounded-2xl overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-line bg-canvas">
                <span className="text-[13px] font-semibold">Message Details</span>
                <button
                  className="text-muted hover:text-ink transition-colors text-[12px]"
                  onClick={() => setSelected(null)}
                  aria-label="Close detail panel"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <Avatar name={selected.name} size={40} />
                  <div>
                    <p className="text-[14px] font-bold">{selected.name}</p>
                    <p className="text-[12px] text-muted">{selected.email}</p>
                  </div>
                </div>

                {selected.telephone && (
                  <Detail label="Phone" value={selected.telephone} />
                )}
                <Detail label="Received" value={fmtDate(selected.created_at)} />

                <div>
                  <p className="text-[11px] text-muted font-semibold uppercase tracking-wide mb-1.5">
                    Message
                  </p>
                  <div className="bg-canvas border border-line rounded-xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap">
                    {selected.message}
                  </div>
                </div>

                <Link
                  href={`mailto:${selected.email}?subject=RE: ${encodeURIComponent(selected.message.substring(0, 40))}`}
                  className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white bg-teal hover:bg-teal-dark shadow-[0_8px_18px_-8px_rgba(15,128,115,.8)] transition-colors"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  Email Back
                </Link>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-40 gap-2">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-[13px]">Select a message</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-[11px] text-muted font-semibold uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-[13px]">{value}</p>
    </div>
  );
}
