"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: string; exact?: boolean };

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    exact: true,
    icon: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  },
  {
    href: "/dashboard/announcements",
    label: "Announcements",
    icon: "M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z M18 8a4 4 0 0 1 0 8",
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: "M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  },
  {
    href: "/dashboard/posts",
    label: "Social Posts",
    icon: "M22 2 11 13 M22 2l-7 20-4-9-9-4Z",
  },
  {
    href: "/dashboard/community-feedback",
    label: "Community Feedback",
    icon: "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
  },
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    icon: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
  },
  {
    href: "/dashboard/users-management",
    label: "User Management",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  },
];

function NavIcon({ d }: Readonly<{ d: string }>) {
  const parts = d.split(" M");
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {parts.map((part, i) => (
        <path key={part} d={(i ? "M" : "") + part} />
      ))}
    </svg>
  );
}

export default function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[68px] flex-col items-center border-r border-line bg-surface py-4 gap-1">
      {/* W logo */}
      <div className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal text-[14px] font-extrabold text-white shadow-[0_8px_20px_-6px_rgba(15,128,115,.7)]">
        W
      </div>

      {NAV.map(({ href, label, icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 hover:bg-teal-soft"
            style={{
              backgroundColor: active ? "#E4F2EF" : undefined,
              color: active ? "#0B6359" : "#6B726E",
            }}
          >
            {active && (
              <span className="absolute -left-2.5 h-5 w-1 rounded-full bg-teal" />
            )}
            <NavIcon d={icon} />
          </Link>
        );
      })}
    </aside>
  );
}
