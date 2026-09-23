import Link from "next/link";

export default async function AccessDeniedPage({ searchParams }: Readonly<{
  searchParams: Promise<{ permission?: string }>;
}>) {
  const { permission } = await searchParams;
  return (
    <div className="grid min-h-[70dvh] place-items-center p-8">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <h1 className="text-xl font-bold text-ink">Access denied</h1>
        <p className="mt-2 text-sm text-muted">
          You do not have permission to view this page{permission ? ` (${permission})` : ""}.
        </p>
        <Link href="/dashboard" className="mt-5 inline-flex rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white">Return to dashboard</Link>
      </div>
    </div>
  );
}
