"use client";
import { ISO_DATE_LENGTH } from "../constants";
import { EVENT_FIELD_LIMITS } from "@/features/events/constants";
import { DEFAULT_SESSION_DURATION_MS, SCHEDULE_PREVIEW_LIMIT, MAX_SCHEDULE_OCCURRENCES, MAX_RECURRENCE_INTERVAL, DEFAULT_RECURRENCE_COUNT } from "../constants";


import { useRequestId } from "../hooks/useRequestId";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Temporal } from "temporal-polyfill";
import { saveEventSchedule } from "@/actions/events";
import { scheduleFields } from "../schemas";
import {
  generateOccurrences,
  type BaseEvent,
  type Rule,
  type Schedule,
} from "../domain";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { formatDateTimeLocal } from "@/app/utils/date";
import {
  assertResponse,
  buttonClass,
  errorMessage,
  inputClass,
  nullable,
  scheduleTitle,
  submitLabel,
  utcInput,
  value,
} from "../lib/formUtilities";
import { Field } from "./Field";
import { PosterFields } from "./PosterFields";

export function ScheduleForm({
  event,
  schedule,
  splitFrom,
  onClose,
}: {
  event: BaseEvent;
  schedule?: Schedule;
  splitFrom?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const discard = useUnsavedChanges(dirty);
  const requestId = useRequestId();
  const [frequency, setFrequency] = useState(
    schedule?.recurrence?.frequency ?? "once",
  );
  const [termination, setTermination] = useState(
    schedule?.recurrence?.until ? "until" : "count",
  );
  const [monthlyMode, setMonthlyMode] = useState(
    schedule?.recurrence?.by_month_day ? "date" : "weekday",
  );
  const [weekdays, setWeekdays] = useState(
    schedule?.recurrence?.by_weekdays ?? [],
  );
  const [positions, setPositions] = useState(
    schedule?.recurrence?.by_set_position ?? [1],
  );
  const [preview, setPreview] = useState<{
    count: number;
    dates: string[];
  } | null>(null);
  const [initialNow] = useState(() => Date.now());
  const start = schedule
    ? formatDateTimeLocal(schedule.start_at)
    : formatDateTimeLocal(new Date(initialNow));
  const end = schedule
    ? formatDateTimeLocal(schedule.end_at)
    : formatDateTimeLocal(new Date(initialNow + DEFAULT_SESSION_DURATION_MS));
  const splitEnd = splitFrom
    ? Temporal.PlainDate.from(splitFrom)
        .add({
          days: Temporal.PlainDate.from(end.slice(0, ISO_DATE_LENGTH)).since(
            Temporal.PlainDate.from(start.slice(0, ISO_DATE_LENGTH)),
          ).days,
        })
        .toString() + end.slice(ISO_DATE_LENGTH)
    : end;
  function parse(form: FormData) {
    const recurrence: Rule | null =
      frequency === "once"
        ? null
        : {
            frequency: frequency as Rule["frequency"],
            interval: Number(value(form, "interval") || 1),
            by_weekdays:
              frequency === "weekly" ||
              (frequency === "monthly" && monthlyMode === "weekday")
                ? weekdays
                : [],
            by_month_day:
              frequency === "monthly" && monthlyMode === "date"
                ? Number(value(form, "month_day"))
                : null,
            by_set_position:
              frequency === "monthly" && monthlyMode === "weekday"
                ? positions
                : [],
            until: termination === "until" ? value(form, "until") : null,
            count:
              termination === "count" ? Number(value(form, "count")) : null,
            exdates: schedule?.recurrence?.exdates ?? [],
          };
    return scheduleFields.parse({
      label: value(form, "label"),
      start_at: utcInput(value(form, "start")),
      end_at: utcInput(value(form, "end")),
      time_zone: "America/Toronto",
      recurrence,
      poster_url: nullable(form, "poster_url"),
      poster_alt: value(form, "poster_alt"),
      location: nullable(form, "location"),
    });
  }
  async function save(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading) return;
    setError("");
    try {
      const fields = parse(new FormData(e.currentTarget));
      const occurrences = generateOccurrences(fields);
      if (!preview) {
        setPreview({
          count: occurrences.length,
          dates: occurrences
            .slice(0, SCHEDULE_PREVIEW_LIMIT)
            .map((o) => formatDateTimeLocal(o.start_at)),
        });
        return;
      }
      setBusy(true);
      const payload = {
        event_id: event.id,
        id: schedule?.id,
        version: schedule?.version,
        fields,
        split_from: splitFrom,
      };
      const result = await saveEventSchedule({
        ...payload,
        request_id: requestId(payload),
      });
      assertResponse(result);
      setDirty(false);
      toast.success("Schedule saved.");
      onClose();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      aria-busy={busy || uploading}
      onSubmit={save}
      onChange={() => {
        setDirty(true);
        setPreview(null);
      }}
      className="space-y-4 rounded-2xl border border-line bg-surface p-5"
    >
      <h3 className="font-semibold">{scheduleTitle(splitFrom, schedule)}</h3>
      <p className="text-sm text-muted">
        Times use America/Toronto. Existing individual overrides and completed
        sessions are preserved.
      </p>
      <fieldset disabled={busy || uploading} className="space-y-4">
        <Field label="Schedule label">
          <input
            name="label"
            className={inputClass}
            defaultValue={schedule?.label ?? ""}
            maxLength={EVENT_FIELD_LIMITS.shortTextMax}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="First session starts">
            <input
              name="start"
              type="datetime-local"
              className={inputClass}
              required
              defaultValue={splitFrom ? splitFrom + start.slice(ISO_DATE_LENGTH) : start}
            />
          </Field>
          <Field label="First session ends">
            <input
              name="end"
              type="datetime-local"
              className={inputClass}
              required
              defaultValue={splitEnd}
            />
          </Field>
        </div>
        <Field label="Repeat">
          <select
            className={inputClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as typeof frequency)}
          >
            <option value="once">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        {frequency !== "once" && (
          <>
            <Field label="Every (interval)">
              <input
                className={inputClass}
                type="number"
                name="interval"
                min={1}
                max={MAX_RECURRENCE_INTERVAL}
                defaultValue={schedule?.recurrence?.interval ?? 1}
                required
              />
            </Field>
            {frequency === "monthly" && (
              <Field label="Monthly pattern">
                <select
                  className={inputClass}
                  value={monthlyMode}
                  onChange={(e) => setMonthlyMode(e.target.value)}
                >
                  <option value="date">Day of month</option>
                  <option value="weekday">Weekday position</option>
                </select>
              </Field>
            )}
            {frequency === "monthly" && monthlyMode === "date" && (
              <Field label="Day of month">
                <input
                  className={inputClass}
                  type="number"
                  name="month_day"
                  min={1}
                  max={31}
                  defaultValue={schedule?.recurrence?.by_month_day ?? 1}
                  required
                />
              </Field>
            )}
            {frequency === "monthly" && monthlyMode === "weekday" && (
              <fieldset>
                <legend className="mb-2 text-sm">
                  Positions among matching weekdays
                </legend>
                <div className="flex flex-wrap gap-3">
                  {[
                    [1, "First"],
                    [2, "Second"],
                    [3, "Third"],
                    [4, "Fourth"],
                    [-2, "Second last"],
                    [-1, "Last"],
                  ].map(([v, l]) => (
                    <label key={v} className="text-sm">
                      <input
                        type="checkbox"
                        checked={positions.includes(Number(v))}
                        onChange={(e) =>
                          setPositions(
                            e.target.checked
                              ? [...positions, Number(v)]
                              : positions.filter((p) => p !== Number(v)),
                          )
                        }
                      />{" "}
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {(frequency === "weekly" ||
              (frequency === "monthly" && monthlyMode === "weekday")) && (
              <div className="flex flex-wrap gap-3">
                {["su", "mo", "tu", "we", "th", "fr", "sa"].map((day) => (
                  <label key={day} className="text-sm">
                    <input
                      type="checkbox"
                      checked={weekdays.includes(day)}
                      onChange={(e) =>
                        setWeekdays(
                          e.target.checked
                            ? [...weekdays, day]
                            : weekdays.filter((d) => d !== day),
                        )
                      }
                    />{" "}
                    {day.toUpperCase()}
                  </label>
                ))}
              </div>
            )}
            <Field label="End recurrence">
              <select
                className={inputClass}
                value={termination}
                onChange={(e) => setTermination(e.target.value)}
              >
                <option value="count">After a number of sessions</option>
                <option value="until">On a date (inclusive)</option>
              </select>
            </Field>
            {termination === "count" ? (
              <Field label="Number of sessions in this schedule">
                <input
                  className={inputClass}
                  name="count"
                  type="number"
                  min={1}
                  max={MAX_SCHEDULE_OCCURRENCES}
                  required
                  defaultValue={schedule?.recurrence?.count ?? DEFAULT_RECURRENCE_COUNT}
                />
              </Field>
            ) : (
              <Field label="Last date">
                <input
                  className={inputClass}
                  name="until"
                  type="date"
                  required
                  defaultValue={schedule?.recurrence?.until?.slice(0, ISO_DATE_LENGTH)}
                />
              </Field>
            )}
          </>
        )}
        <Field label="Location override (leave blank to inherit)">
          <input
            className={inputClass}
            name="location"
            maxLength={EVENT_FIELD_LIMITS.shortTextMax}
            defaultValue={schedule?.location ?? ""}
          />
        </Field>
        <PosterFields
          title={event.title}
          url={schedule?.poster_url ?? null}
          alt={schedule?.poster_alt ?? ""}
          inherited={event}
          onBusy={setUploading}
          onChange={() => {
            setDirty(true);
            setPreview(null);
          }}
        />
        {preview && (
          <div role="status" className="rounded-xl bg-teal-soft p-3 text-sm">
            <p>{preview.count} sessions in this schedule. First dates:</p>
            <ul>
              {preview.dates.map((date) => (
                <li key={date}>{date.replace("T", " ")}</li>
              ))}
            </ul>
            <p>
              Saving updates this schedule and flags its campaign for review.
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <button type="submit" className={buttonClass}>
            {submitLabel(
              busy,
              Boolean(preview),
              "Preview schedule",
              "Confirm schedule",
            )}
          </button>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => {
              if (discard()) onClose();
            }}
          >
            Cancel
          </button>
        </div>
      </fieldset>
      {busy && <p role="status">Saving schedule…</p>}
      {uploading && <p role="status">Uploading poster…</p>}
      {error && (
        <p role="alert" className="whitespace-pre-wrap text-sm text-coral">
          {error}
        </p>
      )}
    </form>
  );
}
