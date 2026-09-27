"use client";
export default function ErrorPage({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <div role="alert" className="space-y-3 p-8">
      <p>Events could not be loaded. Your saved data has not been changed.</p>
      <button
        onClick={reset}
        className="rounded-xl bg-teal px-4 py-2 text-white"
      >
        Retry
      </button>
    </div>
  );
}
