import { registrationPreview, registrationValue, type Registration } from "../lib/registrants";

/** Server-render submission fields recursively without an event-specific layout. */
export function RegistrationFields({ registration, depth = 0 }: Readonly<{
  registration: unknown;
  depth?: number;
}>) {
  if (registration === null || typeof registration !== "object") {
    return <span className="whitespace-pre-wrap break-words">{registrationValue(registration)}</span>;
  }
  // Preserve unusually deep payloads without unbounded component recursion.
  if (depth >= 12) {
    return <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-canvas p-3 text-xs">{registrationValue(registration)}</pre>;
  }
  if (Array.isArray(registration)) {
    if (!registration.length) return <p className="text-muted">No entries.</p>;
    return (
      <ol className="space-y-2">
        {registration.map((entry, index) => (
          <li key={index}>
            {entry !== null && typeof entry === "object" ? (
              <details open className="rounded-xl border border-line">
                <summary className="cursor-pointer break-words px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-teal">
                  Entry {index + 1}
                  {!Array.isArray(entry) && <span className="ml-2 font-normal text-muted">{registrationPreview(entry as Registration)}</span>}
                </summary>
                <div className="border-t border-line p-4">
                  <RegistrationFields registration={entry} depth={depth + 1} />
                </div>
              </details>
            ) : (
              <span className="flex gap-2">
                <span aria-hidden="true" className="text-muted">{index + 1}.</span>
                <RegistrationFields registration={entry} depth={depth + 1} />
              </span>
            )}
          </li>
        ))}
      </ol>
    );
  }
  const entries = Object.entries(registration);
  if (!entries.length) return <p className="text-sm text-muted">No fields submitted.</p>;
  return (
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      {entries.map(([label, value]) => {
        const grouped = value !== null && typeof value === "object";
        return (
          <div key={label} className={`min-w-0 space-y-1 ${grouped ? "sm:col-span-2" : ""}`}>
            <dt className="break-words text-sm font-semibold text-ink">{label}</dt>
            <dd className={`min-w-0 text-sm ${grouped && !Array.isArray(value) ? "rounded-xl border border-line p-4" : ""}`}>
              <RegistrationFields registration={value} depth={depth + 1} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
