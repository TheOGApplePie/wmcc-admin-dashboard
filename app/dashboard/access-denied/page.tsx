import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-ink">You don’t have access</h1>
        <p className="mt-2 text-sm text-muted">Your account does not have permission to view this area. Contact a Board member if you believe this is a mistake.</p>
        <Link href="/dashboard" className="mt-5 inline-flex rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white">Return to dashboard</Link>
      </div>
    </div>
  );
}
