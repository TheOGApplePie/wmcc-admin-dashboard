"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Announcement } from "@/app/schemas/announcement";
import { reorderAnnouncements } from "@/features/announcements/actions";
import { useAnnouncementModal } from "@/features/announcements/modalContext";
import { Icon } from "@/app/components/ui/Icon";

// ─── Constants ────────────────────────────────────────────────────────────────

const DESKTOP_ICON = "M2 6C2 4.34315 3.34315 3 5 3H19C20.6569 3 22 4.34315 22 6V15C22 16.6569 20.6569 18 19 18H13V19H15C15.5523 19 16 19.4477 16 20C16 20.5523 15.5523 21 15 21H9C8.44772 21 8 20.5523 8 20C8 19.4477 8.44772 19 9 19H11V18H5C3.34315 18 2 16.6569 2 15V6Z";
const MOBILE_ICON  = "M9.2 21H14.8C15.9201 21 16.4802 21 16.908 20.782C17.2843 20.5903 17.5903 20.2843 17.782 19.908C18 19.4802 18 18.9201 18 17.8V6.2C18 5.0799 18 4.51984 17.782 4.09202C17.5903 3.71569 17.2843 3.40973 16.908 3.21799C16.4802 3 15.9201 3 14.8 3H9.2C8.0799 3 7.51984 3 7.09202 3.21799C6.71569 3.40973 6.40973 3.71569 6.21799 4.09202C6 4.51984 6 5.07989 6 6.2V17.8C6 18.9201 6 19.4802 6.21799 19.908C6.40973 20.2843 6.71569 20.5903 7.09202 20.782C7.51984 21 8.07989 21 9.2 21Z M12 18H12.01";
const SLIDE_BG = "linear-gradient(135deg, #08101a 0%, #1e3a5f 100%)";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isExpired(a: Announcement) {
  return new Date(a.expires_at) < new Date();
}

function fmtExpiry(d: Date | string) {
  return new Date(d).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
    timeZone: "America/Toronto",
  });
}

// ─── Carousel slide layouts ───────────────────────────────────────────────────

function CarouselSlide({
  announcement,
  isMobile,
}: Readonly<{ announcement: Announcement; isMobile: boolean }>) {
  const hasPoster = !!announcement.poster_url;
  const ctaLabel = announcement.call_to_action_caption || "Learn More";

  const CtaButton = announcement.call_to_action_link ? (
    <span
      className="px-6 py-2.5 rounded-lg text-white font-semibold text-[13px] cursor-default"
      style={{ backgroundColor: "#0F8073" }}
    >
      {ctaLabel}
    </span>
  ) : null;

  if (isMobile) {
    return hasPoster ? (
      <div className="flex flex-col items-center gap-4 p-5 h-full justify-center">
        <div
          className="relative w-full rounded-xl overflow-hidden"
          style={{ maxWidth: 160, aspectRatio: "3/4" }}
        >
          <Image
            src={announcement.poster_url!}
            alt={announcement.poster_alt || announcement.title}
            fill
            className="object-cover"
          />
        </div>
        {CtaButton}
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center gap-3 p-6 h-full text-center">
        <h2 className="font-bold text-white text-[17px] leading-snug">{announcement.title}</h2>
        <p className="text-white/70 text-[12px] leading-relaxed">{announcement.description}</p>
        {CtaButton}
      </div>
    );
  }

  if (hasPoster) {
    return (
      <div className="grid grid-cols-2 gap-6 items-center px-10 py-8 h-full">
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-white text-[22px] leading-snug">{announcement.title}</h2>
          <p className="text-white/70 text-[14px] leading-relaxed">{announcement.description}</p>
          {CtaButton}
        </div>
        <div className="flex items-center justify-center">
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-lg"
            style={{ maxWidth: 240, aspectRatio: "3/4" }}
          >
            <Image
              src={announcement.poster_url!}
              alt={announcement.poster_alt || announcement.title}
              fill
              className="object-cover"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-16 py-10 h-full text-center">
      <h2 className="font-bold text-white text-[24px] leading-snug">{announcement.title}</h2>
      <p className="text-white/70 text-[14px] leading-relaxed max-w-md">{announcement.description}</p>
      {CtaButton}
    </div>
  );
}

// ─── Browser chrome bar ───────────────────────────────────────────────────────

function BrowserBar() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-canvas border-b border-line">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#FF5F57" }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#FFBD2E" }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#28C840" }} />
      </div>
      <div className="flex-1 bg-surface border border-line rounded-md px-3 py-1 text-[11px] text-muted flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-50">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        https://www.wmcc.ca
      </div>
    </div>
  );
}

// ─── Carousel preview wrapper ─────────────────────────────────────────────────

interface CarouselPreviewProps {
  announcements: Announcement[];
  selected: Announcement | null;
  isMobile: boolean;
  onNavigate: (ann: Announcement) => void;
}

function CarouselPreview({ announcements, selected, isMobile, onNavigate }: Readonly<CarouselPreviewProps>) {
  const slideIndex = selected ? Math.max(0, announcements.findIndex((a) => a.id === selected.id)) : 0;

  function prev() {
    if (!announcements.length) return;
    onNavigate(announcements[(slideIndex - 1 + announcements.length) % announcements.length]);
  }

  function next() {
    if (!announcements.length) return;
    onNavigate(announcements[(slideIndex + 1) % announcements.length]);
  }

  const dots = announcements.length > 1 && (
    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 pointer-events-none">
      {announcements.map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all"
          style={{
            width: i === slideIndex ? 20 : 6,
            height: 6,
            backgroundColor: i === slideIndex ? "#fff" : "rgba(255,255,255,.35)",
          }}
        />
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex items-center justify-center py-5">
        <div
          className="overflow-hidden"
          style={{ width: 195, height: 370, borderRadius: 28, border: "5px solid #15201C" }}
        >
          <div className="flex justify-center pt-2 pb-1" style={{ backgroundColor: "#15201C" }}>
            <div className="w-14 h-3 rounded-full" style={{ backgroundColor: "#0a130f" }} />
          </div>
          <div className="relative" style={{ background: SLIDE_BG, height: "calc(100% - 22px)" }}>
            {selected ? (
              <CarouselSlide announcement={selected} isMobile />
            ) : (
              <div className="flex items-center justify-center h-full opacity-30 text-white text-[11px]">
                No announcements
              </div>
            )}
            {dots}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="rounded-xl border border-line overflow-hidden shadow-md">
        <BrowserBar />
        <div className="relative" style={{ background: SLIDE_BG, minHeight: 240 }}>
          {selected ? (
            <CarouselSlide announcement={selected} isMobile={false} />
          ) : (
            <div className="flex items-center justify-center py-14 opacity-30 text-white text-[13px]">
              No announcements
            </div>
          )}
          {announcements.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,.15)", backdropFilter: "blur(4px)" }}
                aria-label="Previous announcement"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={next}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,.15)", backdropFilter: "blur(4px)" }}
                aria-label="Next announcement"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}
          {dots}
        </div>
      </div>
    </div>
  );
}

// ─── Sortable filmstrip card ──────────────────────────────────────────────────

function SortableFilmstripCard({
  announcement,
  index,
  selected,
  onSelect,
}: Readonly<{
  announcement: Announcement;
  index: number;
  selected: boolean;
  onSelect: () => void;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: announcement.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }}
      className={`relative shrink-0 flex flex-col gap-1.5 w-[136px] rounded-xl p-2.5 border-2 cursor-grab active:cursor-grabbing transition-all ${
        selected ? "border-teal bg-teal-soft shadow-sm" : "border-line bg-canvas hover:border-teal/40"
      }`}
      {...attributes}
      {...listeners}
      onClick={onSelect}
    >
      <div
        className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white z-10 pointer-events-none"
        style={{ backgroundColor: selected ? "#0F8073" : "#15201C" }}
      >
        {index + 1}
      </div>

      {announcement.poster_url ? (
        <div className="relative w-full rounded-lg overflow-hidden" style={{ aspectRatio: "3/2" }}>
          <Image
            src={announcement.poster_url}
            alt={announcement.poster_alt || announcement.title}
            fill
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className="w-full rounded-lg flex items-center justify-center"
          style={{ aspectRatio: "3/2", background: SLIDE_BG }}
        >
          <span className="text-[10px] text-white/40 font-medium">No poster</span>
        </div>
      )}

      <p className="text-[11px] font-semibold leading-tight line-clamp-2 text-ink">{announcement.title}</p>
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#0F8073" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#0F8073" }} />
        Live
      </span>
    </div>
  );
}

// ─── Expired list row ─────────────────────────────────────────────────────────

function ExpiredRow({
  announcement,
  selected,
  onSelect,
}: Readonly<{ announcement: Announcement; selected: boolean; onSelect: () => void }>) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border-2 transition-all ${
        selected ? "border-teal bg-teal-soft" : "border-transparent hover:bg-canvas"
      }`}
    >
      {announcement.poster_url ? (
        <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-line">
          <Image src={announcement.poster_url} alt="" fill className="object-cover" />
        </div>
      ) : (
        <div
          className="w-10 h-10 rounded-lg shrink-0"
          style={{ background: SLIDE_BG }}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-ink truncate">{announcement.title}</p>
        <p className="text-[11px] text-muted">Expired {fmtExpiry(announcement.expires_at)}</p>
      </div>
    </button>
  );
}

// ─── Inspector panel ──────────────────────────────────────────────────────────

function InspectorPanel({
  selected,
  liveIds,
}: Readonly<{ selected: Announcement | null; liveIds: number[] }>) {
  const { openEdit, openRestore } = useAnnouncementModal();
  const expired = selected ? isExpired(selected) : false;

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted gap-2">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
        </svg>
        <p className="text-[12px] text-center opacity-40">Select an announcement<br />to inspect</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-ink">
          {expired ? "Expired announcement" : "Edit announcement"}
        </h3>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{
            backgroundColor: expired ? "#FEE2E2" : "#CCFBF1",
            color:           expired ? "#B91C1C" : "#065F46",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: expired ? "#B91C1C" : "#0F8073" }}
          />
          {expired ? "Expired" : "Live"}
        </span>
      </div>

      {!expired && (
        <p className="text-[11px] text-muted">
          Position {liveIds.indexOf(selected.id) + 1} of {liveIds.length} in rotation
        </p>
      )}

      <div>
        <p className="text-[11px] text-muted mb-0.5">Title</p>
        <p className="text-[13px] font-semibold text-ink">{selected.title}</p>
      </div>
      <div>
        <p className="text-[11px] text-muted mb-0.5">Description</p>
        <p className="text-[12px] text-ink/80 leading-relaxed">{selected.description}</p>
      </div>
      {selected.call_to_action_caption && (
        <div>
          <p className="text-[11px] text-muted mb-0.5">Call to action</p>
          <p className="text-[12px] font-medium text-ink">{selected.call_to_action_caption}</p>
        </div>
      )}
      <div>
        <p className="text-[11px] text-muted mb-0.5">{expired ? "Expired" : "Expires"}</p>
        <p className="text-[12px] text-ink">{fmtExpiry(selected.expires_at)}</p>
      </div>

      <div className="flex flex-col gap-2 pt-3 border-t border-line">
        {expired ? (
          <button
            onClick={() => openRestore(selected)}
            className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors"
            style={{ backgroundColor: "#0F8073", boxShadow: "0 4px 12px -4px rgba(15,128,115,.5)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.99" />
            </svg>
            Restore to live
          </button>
        ) : (
          <button
            onClick={() => openEdit(selected)}
            className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors bg-teal-soft text-teal hover:bg-teal/20"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AnnouncementsClientProps {
  currentAnnouncements: Announcement[];
  expiredAnnouncements: Announcement[];
}

export default function AnnouncementsClient({
  currentAnnouncements,
  expiredAnnouncements,
}: Readonly<AnnouncementsClientProps>) {
  const [liveItems, setLiveItems] = useState(currentAnnouncements);
  const [selected, setSelected]   = useState<Announcement | null>(currentAnnouncements[0] ?? null);
  const [isMobile, setIsMobile]   = useState(false);
  const [tab, setTab]             = useState<"live" | "expired">("live");

  // Server actions revalidate this route and send fresh props; re-sync local
  // state or the filmstrip/inspector keep showing pre-mutation data.
  useEffect(() => {
    setLiveItems(currentAnnouncements);
    setSelected((prev) => {
      const all = [...currentAnnouncements, ...expiredAnnouncements];
      const refreshed = prev ? all.find((a) => a.id === prev.id) : undefined;
      return refreshed ?? currentAnnouncements[0] ?? expiredAnnouncements[0] ?? null;
    });
  }, [currentAnnouncements, expiredAnnouncements]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = liveItems.findIndex((a) => a.id === active.id);
    const newIndex = liveItems.findIndex((a) => a.id === over.id);
    const reordered = arrayMove(liveItems, oldIndex, newIndex);
    setLiveItems(reordered);
    await reorderAnnouncements({ ids: reordered.map((a) => a.id) });
  }, [liveItems]);

  function handleTabChange(newTab: "live" | "expired") {
    setTab(newTab);
    if (newTab === "expired") {
      setSelected(expiredAnnouncements[0] ?? null);
    } else {
      setSelected(liveItems[0] ?? null);
    }
  }

  const isSelectedExpired = selected ? isExpired(selected) : false;
  // Expired items still preview (with the "Archived" indicator), but arrows/dots
  // only make sense for the live rotation.
  const previewItems = isSelectedExpired ? [] : liveItems;

  return (
    <div className="flex flex-col lg:flex-row gap-5">

      {/* ── Left: preview + tabs ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 bg-surface border border-line rounded-2xl overflow-hidden">

        {/* Preview header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <span className="text-[12px] font-semibold text-muted">Live preview</span>
          {isSelectedExpired && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-muted" />
              Archived · not on site
            </span>
          )}
          <div className="flex-1" />
          {/* Device toggle */}
          <div className="flex items-center gap-0.5 rounded-xl bg-canvas border border-line p-1">
            {(["desktop", "mobile"] as const).map((device) => {
              const active = isMobile ? device === "mobile" : device === "desktop";
              return (
                <button
                  key={device}
                  onClick={() => setIsMobile(device === "mobile")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    active ? "bg-ink text-white shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon d={device === "desktop" ? DESKTOP_ICON : MOBILE_ICON} size={13} />
                  {device === "desktop" ? "Desktop" : "Mobile"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Carousel preview */}
        <CarouselPreview
          announcements={previewItems}
          selected={selected}
          isMobile={isMobile}
          onNavigate={setSelected}
        />

        {/* Tab bar */}
        <div className="border-t border-line">
          <div className="flex">
            {(["live", "expired"] as const).map((t) => {
              const count = t === "live" ? liveItems.length : expiredAnnouncements.length;
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  className={`flex-1 px-5 py-3 text-[12px] font-semibold transition-colors ${
                    active ? "text-ink border-b-2 border-teal -mb-px" : "text-muted hover:text-ink"
                  }`}
                >
                  {t === "live" ? "Live rotation" : "Expired"}
                  <span
                    className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{
                      backgroundColor: active && t === "live" ? "#D1FAE5" : "#F6F4EF",
                      color:           active && t === "live" ? "#065F46" : "#6B726E",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab body */}
          <div className="px-4 pt-3 pb-4">
            {tab === "live" ? (
              <>
                <p className="text-[11px] text-muted mb-3">
                  Drag to reorder · {liveItems.length} slide{liveItems.length !== 1 ? "s" : ""} · 6s each
                </p>
                {liveItems.length === 0 ? (
                  <p className="text-[13px] text-muted py-3">No active announcements yet.</p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={liveItems.map((a) => a.id)} strategy={horizontalListSortingStrategy}>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {liveItems.map((ann, i) => (
                          <SortableFilmstripCard
                            key={ann.id}
                            announcement={ann}
                            index={i}
                            selected={selected?.id === ann.id}
                            onSelect={() => setSelected(ann)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </>
            ) : (
              <>
                <p className="text-[11px] text-muted mb-3">
                  Announcements auto-archive when their end date passes. Restore one to push it back into the live rotation.
                </p>
                {expiredAnnouncements.length === 0 ? (
                  <p className="text-[13px] text-muted py-3">No expired announcements.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {expiredAnnouncements.map((ann) => (
                      <ExpiredRow
                        key={ann.id}
                        announcement={ann}
                        selected={selected?.id === ann.id}
                        onSelect={() => setSelected(ann)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: inspector ───────────────────────────────────────────── */}
      <div className="w-full lg:w-72 shrink-0">
        <div className="bg-surface border border-line rounded-2xl p-5 sticky top-[73px]">
          <InspectorPanel selected={selected} liveIds={liveItems.map((a) => a.id)} />
        </div>
      </div>

    </div>
  );
}
