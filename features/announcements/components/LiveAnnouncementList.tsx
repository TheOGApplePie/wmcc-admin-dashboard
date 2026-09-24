"use client";

import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Announcement } from "@/app/schemas/announcement";
import SortableFilmstripCard from "./SortableFilmstripCard";

export default function LiveAnnouncementList({ liveItems, selected, canEdit, onSelect, onDragEnd }: Readonly<{
  liveItems: Announcement[];
  selected: Announcement | null;
  canEdit: boolean;
  onSelect: (announcement: Announcement) => void;
  onDragEnd: (event: DragEndEvent) => void;
}>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!liveItems.length) return <p className="text-[13px] text-muted py-3">No active announcements yet.</p>;
  return <>
    <p className="text-[11px] text-muted mb-3">
      {canEdit ? "Drag to reorder" : "Live rotation"} · {liveItems.length} slides · 6s each
    </p>
                  <DndContext
                    sensors={canEdit ? sensors : []}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={liveItems.map((a) => a.id)}
                      strategy={horizontalListSortingStrategy}
                    >
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {liveItems.map((ann, i) => (
                          <SortableFilmstripCard
                            key={ann.id}
                            announcement={ann}
                            index={i}
                            canEdit={canEdit}
                            selected={selected?.id === ann.id}
                            onSelect={() => onSelect(ann)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
  </>;
}
