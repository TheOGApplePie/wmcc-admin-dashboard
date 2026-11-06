import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";

type LogFields = Record<string, unknown>;

export async function withCronLogging(
  job: string,
  handler: (log: CronLogger) => Promise<NextResponse>,
): Promise<NextResponse> {
  const startedAt = Date.now();
  const runId = randomUUID();
  let summary: LogFields = {};
  const write = (
    level: "info" | "warn" | "error",
    event: string,
    fields: LogFields = {},
  ) => {
    console[level](
      JSON.stringify({
        ...fields,
        source: "cron",
        job,
        runId,
        event,
        timestamp: new Date().toISOString(),
      }),
    );
  };
  const log: CronLogger = {
    summary: (fields) => { summary = fields; },
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
  log.info("started");
  try {
    const response = await handler(log);
    log.info("completed", {
      ...summary,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    log.error("unhandled_error", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export type CronLogger = Record<
  "info" | "warn" | "error",
  (event: string, fields?: LogFields) => void
> & { summary: (fields: LogFields) => void };
