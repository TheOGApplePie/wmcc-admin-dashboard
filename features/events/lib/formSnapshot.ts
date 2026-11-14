// Compare editable values, not touched state. Include disabled controls so a
// pending mutation cannot change the snapshot simply by disabling a fieldset.
export function normalizedFormValues(values: Array<[string, string]>): string {
  const grouped = new Map<string, string[]>();
  for (const [name, raw] of values) {
    const value = raw.trim();
    grouped.set(name, [...(grouped.get(name) ?? []), value]);
  }
  return JSON.stringify([...grouped].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => [name, values.sort()]));
}
export function formSnapshot(form: HTMLFormElement): string {
  const values: Array<[string, string]> = [];
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
    if (!element.name || element.closest("fieldset[hidden]")) continue;
    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) && !element.checked) continue;
    let value = element.value;
    if (element instanceof HTMLInputElement && element.type === "number" && value.trim() && Number.isFinite(Number(value))) value = String(Number(value));
    if (element instanceof HTMLInputElement && element.type === "datetime-local" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:00(?:\.0+)?)?$/.test(value)) value = value.slice(0, 16);
    values.push([element.name, value]);
  }
  return normalizedFormValues(values);
}

// Publication/version changes may come from a schedule save. Only a change to
// shared content makes an open details editor's source baseline stale.
export function eventContentKey(event: import("../domain").BaseEvent): string {
  return JSON.stringify([
    event.title, event.description, event.location, event.navigation_slug,
    event.poster_url, event.poster_alt, event.cognito_form_id,
    event.call_to_action_link, event.call_to_action_caption, event.gallery_url,
  ]);
}
