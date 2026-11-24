"use client";
export default function EmailError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <div role="alert" className="space-y-3 p-6"><p>Unable to complete that action. The communication may have changed, or a required field may be missing.</p><button type="button" onClick={reset} className="rounded-lg border border-teal px-3 py-2">Reload and try again</button></div>;
}
