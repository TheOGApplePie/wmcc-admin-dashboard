"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type SubmitEvent } from "react";
import Link from "next/link";
import { EventLibraryCard } from "./EventLibraryCard";
import { useRouter } from "next/navigation";
import { loadEventLibrary } from "@/actions/eventLibrary";
import { libraryHref, parseLibraryFilters, type LibraryFilters, type LibraryPage } from "../library/filters";

export default function EventLibraryClient({ filters, initial }: Readonly<{ filters: LibraryFilters; initial: LibraryPage }>) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.cursor);
  const [total, setTotal] = useState(initial.total);
  const [query, setQuery] = useState(filters.q);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const searchPending = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);
  useEffect(() => () => { requestId.current++; }, []);
  const changeFilters = (form: HTMLFormElement, replace = false) => {
    if (debounce.current) clearTimeout(debounce.current);
    const fields = new FormData(form);
    const next = parseLibraryFilters({ q: String(fields.get("q") ?? ""), status: String(fields.get("status") ?? ""), sort: String(fields.get("sort") ?? "") });
    const href = libraryHref(next);
    searchPending.current = false;
    if (href === libraryHref(filters)) return;
    requestId.current++;
    inFlight.current = false;
    setItems([]); setCursor(null); setError(null); setMessage(""); setLoading(false);
    startNavigation(() => replace ? router.replace(href) : router.push(href));
  };
  const submit = (event: SubmitEvent<HTMLFormElement>) => { event.preventDefault(); changeFilters(event.currentTarget); };
  const loadMore = useCallback(async () => {
    if (!cursor || inFlight.current || navigating || searchPending.current) return;
    inFlight.current = true;
    const id = ++requestId.current;
    setLoading(true); setError(null);
    try {
      let result = await loadEventLibrary({ ...filters, cursor });
      if (id !== requestId.current) return;
      const restart = result.resetRequired;
      if (restart) {
        result = await loadEventLibrary(filters);
        if (id !== requestId.current) return;
      }
      if (!result.data) throw new Error(result.error ?? "Unable to load events.");
      const page = result.data;
      setItems((previous) => restart ? page.items : [...previous, ...page.items]);
      setCursor(page.cursor); setTotal(page.total);
      if (restart) setMessage("The event list changed or expired and has been reloaded from the beginning.");
    } catch (failure) {
      if (id === requestId.current) setError(failure instanceof Error ? failure.message : "Unable to load events.");
    } finally {
      if (id === requestId.current) { inFlight.current = false; setLoading(false); }
    }
  }, [cursor, filters, navigating]);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !cursor || error || !globalThis.IntersectionObserver) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "300px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cursor, error, loadMore]);
  const selectClass = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2";
  let loadLabel = "Load more";
  if (error) loadLabel = "Retry loading";
  if (loading) loadLabel = "Loading events…";
  return <div className="space-y-5" aria-busy={navigating || loading}>
    <Link href="/dashboard/events" className="text-sm underline">Back to calendar</Link>
    <form ref={formRef} onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 basis-52 space-y-1 text-sm font-medium">Search events
        <input name="q" value={query} onChange={(event) => {
          setQuery(event.target.value); searchPending.current = true;
          requestId.current++; inFlight.current = false; setLoading(false);
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => { if (formRef.current) changeFilters(formRef.current, true); }, 350);
        }} placeholder="Search events" className={selectClass} disabled={navigating} />
      </label>
      <label className="min-w-40 flex-1 basis-40 space-y-1 text-sm font-medium">Publication status
        <select name="status" value={filters.status} disabled={navigating} onChange={(event) => { if (event.currentTarget.form) changeFilters(event.currentTarget.form); }} className={selectClass}>
          <option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
        </select>
      </label>
      <label className="min-w-40 flex-1 basis-40 space-y-1 text-sm font-medium">Sort by
        <select name="sort" value={filters.sort} disabled={navigating} onChange={(event) => { if (event.currentTarget.form) changeFilters(event.currentTarget.form); }} className={selectClass}>
          <option value="next_occurrence">Next occurrence</option><option value="created_at">Date created</option><option value="updated_at">Last updated</option>
        </select>
      </label>
      <button disabled={navigating} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Search</button>
    </form>
    {message && <p role="status" className="text-sm text-muted">{message}</p>}
    {navigating && <p role="status" className="text-sm text-muted">Updating events…</p>}
    {!items.length && !navigating && <div className="rounded-2xl border border-line p-8 text-center">
      <h2 className="font-semibold">{filters.q || filters.status ? "No matching events" : "Your event library is empty"}</h2>
      <p className="mt-2 text-sm text-muted">{filters.q || filters.status ? "Try another title or publication status." : "Use Create event to add your first event when you have editing access."}</p>
      {(filters.q || filters.status) && <Link href={libraryHref({ ...filters, q: "", status: "" })} className="mt-4 inline-block text-sm underline">Clear filters</Link>}
    </div>}
    <ul aria-label="Events" className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
      {items.map((event) => <EventLibraryCard key={event.id} event={event} sort={filters.sort} />)}
    </ul>
    {error && <p role="alert" className="text-sm text-coral">{error}</p>}
    <div ref={sentinel} className="flex flex-wrap items-center justify-between gap-3">
      {!navigating && <p role="status" className="text-sm text-muted">{items.length} of {total} events{!cursor && items.length > 0 ? " · All events loaded" : ""}</p>}
      {cursor && <button type="button" disabled={loading || navigating} onClick={() => void loadMore()} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">{loadLabel}</button>}
    </div>
  </div>;
}
