import Link from "next/link";
import { Btn } from "@/app/components/ui/Btn";
import { useCalendarController } from "@fullcalendar/react";
import { useCan } from "@/store/hooks";

type CalendarController = ReturnType<typeof useCalendarController>;

interface CalendarToolbarProps {
  controller: CalendarController;
  onAdd: () => void;
}

export function CalendarToolbar({
  controller,
  onAdd,
}: Readonly<CalendarToolbarProps>) {
  const buttons = controller.getButtonState();
  const canEdit = useCan("events.edit");

  return (
    <div className="flex justify-between py-4">
      <div className="flex gap-3">
        <Btn
          className="btn border-0"
          variant="soft"
          size="lg"
          onClick={() => controller.prev()}
          disabled={buttons.prev.isDisabled}
          aria-label={buttons.prev.hint}
        >
          {buttons.prev.text}
        </Btn>
        <Btn
          variant="dark"
          className="btn border-0"
          size="lg"
          onClick={() => controller.today()}
          disabled={buttons.today.isDisabled}
          aria-label={buttons.today.hint}
        >
          {buttons.today.text}
        </Btn>
        <Btn
          variant="soft"
          size="lg"
          className="btn border-0"
          onClick={() => controller.next()}
          disabled={buttons.next.isDisabled}
          aria-label={buttons.next.hint}
        >
          {buttons.next.text}
        </Btn>
      </div>
      <div className="toolbar-title">{controller.view?.title}</div>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/events/library" className="text-sm underline">
          All events
        </Link>
        {canEdit && (
          <Btn className="btn border-0" onClick={onAdd}>
            Add Event
          </Btn>
        )}
      </div>
    </div>
  );
}
