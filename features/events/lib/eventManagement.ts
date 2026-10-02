import type { Schedule } from "../domain";
export type Campaign = { id: string; name: string; status: string };
export type Editor = { schedule?: Schedule; splitFrom?: string };
