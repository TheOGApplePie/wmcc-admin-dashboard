"use client";


export default function BrowserBar() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-canvas border-b border-line">
      <div className="flex gap-1.5">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: "#FF5F57" }}
        />
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: "#FFBD2E" }}
        />
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: "#28C840" }}
        />
      </div>
      <div className="flex-1 bg-surface border border-line rounded-md px-3 py-1 text-[11px] text-muted flex items-center gap-1.5">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 opacity-50"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        https://www.wmcc.ca
      </div>
    </div>
  );
}
