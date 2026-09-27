import { Temporal } from "temporal-polyfill";
import { ZodError } from "zod";
import type { Schedule } from "../domain";

export const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm";

export const buttonClass =
  "rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export type ActionResponse =
  | {
      serverError?: string;
      validationErrors?: unknown;
      data?: { error?: string; data?: unknown };
    }
  | undefined;

export function assertResponse(result: ActionResponse) {
  if (
    result?.serverError ||
    result?.validationErrors ||
    !result?.data ||
    result.data.error
  )
    throw new Error(
      result?.serverError ||
        result?.data?.error ||
        "Please check the form and try again.",
    );
}

export function utcInput(value: string) {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime("America/Toronto", { disambiguation: "reject" })
    .toInstant()
    .toString();
}

export function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function nullable(form: FormData, key: string) {
  return value(form, key) || null;
}

export function errorMessage(error: unknown) {
  if (error instanceof ZodError)
    return error.issues.map((issue) => issue.message).join("\n");
  if (error instanceof Error) return error.message;
  return "The request failed. Please try again.";
}

export function submitLabel(
  busy: boolean,
  ready: boolean,
  initial: string,
  confirmed: string,
) {
  if (busy) return "Saving…";
  return ready ? confirmed : initial;
}

export function scheduleTitle(splitFrom?: string, schedule?: Schedule) {
  if (splitFrom) return "This and following sessions";
  return schedule ? "Edit schedule" : "Add schedule";
}
