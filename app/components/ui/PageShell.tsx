import NotificationBell from "@/app/components/NotificationBell";
import SignoutButton from "@/app/components/signoutButton";

interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
}

export function PageShell({
  title,
  subtitle,
  actions,
  children,
  noPad,
}: Readonly<PageShellProps>) {
  return (
    <>
      {/* Sticky page topbar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-line px-7 py-3.5 backdrop-blur-sm"
        style={{ backgroundColor: "rgba(246,244,239,0.9)" }}
      >
        <div>
          <h1 className="text-[18px] font-extrabold tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12px] text-muted leading-tight">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {actions}

          <NotificationBell />

          <div className="dropdown dropdown-end">
            <button
              tabIndex={0}
              className="btn btn-ghost btn-circle btn-sm"
              aria-label="User menu"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h.01M12 12h.01M19 12h.01" />
              </svg>
            </button>
            <ul
              tabIndex={-1}
              className="menu menu-sm dropdown-content bg-base-100 rounded-box z-50 mt-3 p-2 shadow-lg border border-line"
            >
              <li>
                <SignoutButton />
              </li>
            </ul>
          </div>
        </div>
      </header>

      {/* Page content */}
      <div className={noPad ? "" : "p-7"}>{children}</div>
    </>
  );
}
