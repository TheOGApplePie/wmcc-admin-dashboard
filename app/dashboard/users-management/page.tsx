import { PageShell } from "@/app/components/ui/PageShell";

export default function UsersManagement() {
  return (
    <PageShell title="User Management" subtitle="Manage admin accounts and permissions">
      <div className="flex flex-col items-center justify-center py-24 opacity-40 gap-3">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <p className="text-[14px]">User management coming soon.</p>
      </div>
    </PageShell>
  );
}
