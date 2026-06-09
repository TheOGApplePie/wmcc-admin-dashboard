"use client";

export default function PostsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center p-6">
      <p className="text-[15px] font-semibold" style={{ color: "var(--sp-ink)" }}>
        Failed to load posts
      </p>
      <p className="text-[13px]" style={{ color: "var(--sp-muted)" }}>
        {error.message}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-(--sp-teal) hover:bg-(--sp-teal-dark) transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
