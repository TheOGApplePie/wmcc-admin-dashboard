"use client";
import Pagination from "@/app/components/pagination";
import { CommunityFeedback } from "@/app/schemas/communityFeedback";
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

function formatDate(dateStr: string) {
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

export default function FeedbackTable({
  feedback,
  count,
}: Readonly<{
  feedback: CommunityFeedback[];
  count: number;
}>) {
  const { register, handleSubmit, formState: { errors }, resetField, control, setValue } =
    useForm<FilterForm>({
      defaultValues: { search: "", startDate: "", endDate: "", currentPage: 1, pageSize: 10 },
      mode: "onChange",
    });

  const startDate = useWatch({ control, name: "startDate" });
  const endDate = useWatch({ control, name: "endDate" });
  const pageSize = useWatch({ control, name: "pageSize" });
  const currentPage = useWatch({ control, name: "currentPage" });

  const [totalCount, setTotalCount] = useState(count);
  const [filteredFeedback, setFilteredFeedback] = useState(feedback);
  const [selected, setSelected] = useState<CommunityFeedback | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(data: FilterForm) {
    setLoading(true);
    const result = await fetchFeedback({
      search: data.search,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      currentPage: data.currentPage,
      pageSize: data.pageSize,
    });
    setFilteredFeedback(result.data?.feedback ?? []);
    setTotalCount(result.data?.count ?? 0);
    setLoading(false);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden gap-4">
      {/* ── Filters ────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="shrink-0 flex flex-wrap gap-3 items-end"
      >
        {/* Search */}
        <div className="flex-1 min-w-48">
          <label className="label text-xs font-medium mb-1" htmlFor="search">Search</label>
          <div className="join w-full">
            <input
              id="search"
              type="search"
              className="input input-bordered join-item w-full"
              placeholder="Search by message…"
              {...register("search")}
            />
            <button type="submit" className="btn btn-neutral join-item">Search</button>
          </div>
        </div>

        {/* From date */}
        <div>
          <label className="label text-xs font-medium mb-1" htmlFor="startDate">From</label>
          <div className="join">
            <input
              id="startDate"
              type="date"
              className="input input-bordered join-item"
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
                className="btn btn-error join-item"
                onClick={() => resetField("startDate")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* To date */}
        <div>
          <label className="label text-xs font-medium mb-1" htmlFor="endDate">To</label>
          <div className="join">
            <input
              id="endDate"
              type="date"
              className="input input-bordered join-item"
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
                className="btn btn-error join-item"
                onClick={() => resetField("endDate")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <button type="submit" className="btn btn-info self-end">
          Apply Filters
        </button>
      </form>

      {(errors.startDate || errors.endDate) && (
        <p className="shrink-0 text-error text-sm -mt-2">
          {errors.startDate?.message ?? errors.endDate?.message}
        </p>
      )}

      {/* ── Two-column layout ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex gap-6">

        {/* Left column — scrollable table + pinned pagination */}
        <div className="flex-1 flex flex-col overflow-hidden border border-base-200 rounded-2xl shadow-sm relative">
          {loading && (
            <div className="absolute inset-0 bg-base-100/60 flex items-center justify-center z-20 rounded-2xl">
              <span className="loading loading-spinner loading-md" />
            </div>
          )}

          {/* Scrollable table area */}
          <div className="flex-1 overflow-y-auto">
            <table className="table table-zebra w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-base-200">
                  <th className="w-36">Name</th>
                  <th>Message</th>
                  <th className="w-44 hidden md:table-cell">Email</th>
                  <th className="w-32 hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeedback.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 opacity-50">
                      No feedback found.
                    </td>
                  </tr>
                ) : (
                  filteredFeedback.map((item) => (
                    <tr
                      key={item.id}
                      className={`cursor-pointer hover transition-colors ${
                        selected?.id === item.id ? "bg-primary/10" : ""
                      }`}
                      onClick={() => setSelected(item)}
                    >
                      <td className="font-medium">{item.name}</td>
                      <td className="max-w-xs">
                        <span className="line-clamp-2 text-sm">{item.message}</span>
                      </td>
                      <td className="text-sm opacity-70 hidden md:table-cell">{item.email}</td>
                      <td className="text-xs opacity-50 hidden lg:table-cell whitespace-nowrap">
                        {formatDate(item.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination — pinned to bottom of left column, outside scroll */}
          {totalCount > pageSize && (
            <div className="shrink-0 p-3 border-t border-base-200">
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

        {/* Detail panel — fills remaining height, scrolls internally */}
        <div className="w-[360px] flex flex-col overflow-hidden border border-base-200 rounded-2xl shadow-sm bg-base-100">
          {selected ? (
            <>
              <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-base-200 bg-base-200/40">
                <h2 className="font-semibold text-base">Message Details</h2>
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={() => setSelected(null)}
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-0.5">Name</p>
                  <p className="text-sm font-medium">{selected.name}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-0.5">Email</p>
                  <p className="text-sm">{selected.email}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-0.5">Phone</p>
                  <p className="text-sm">
                    {selected.telephone ? selected.telephone : <span className="opacity-40 italic">Not provided</span>}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-0.5">Received</p>
                  <p className="text-sm">{formatDate(selected.created_at)}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-1">Message</p>
                  <div className="bg-base-200 rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {selected.message}
                  </div>
                </div>

                <Link
                  href={`mailto:${selected.email}?subject=RE: ${encodeURIComponent(selected.message.substring(0, 40))}`}
                  className="btn btn-neutral btn-sm w-full mt-1"
                >
                  Email Back
                </Link>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-40 gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="text-sm">Select a message to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
