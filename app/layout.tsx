import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "WMCC Admin Dashboard",
  description: "Admin Dashboard for wmcc.ca",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="drawer drawer-open">
          <input id="my-drawer-4" type="checkbox" className="drawer-toggle" />
          <div className="drawer-content">{children}</div>

          <div className="border-r border-r-gray-600 drawer-side is-drawer-close:overflow-visible">
            <label
              htmlFor="my-drawer-4"
              aria-label="close sidebar"
              className="drawer-overlay"
            ></label>
            <div className="is-drawer-close:w-14 is-drawer-open:w-64 bg-base-200 flex flex-col items-start min-h-full">
              {/* Sidebar content here */}
              <ul className="menu w-full grow">
                {/* list item */}
                <li>
                  <Link href={"/"}>
                    <button
                      className="is-drawer-close:tooltip is-drawer-close:tooltip-right"
                      data-tip="Homepage"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeWidth="2"
                        fill="none"
                        stroke="currentColor"
                        className="inline-block size-6 my-1.5"
                      >
                        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path>
                        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      </svg>
                      <span className="is-drawer-close:hidden">Homepage</span>
                    </button>
                  </Link>
                </li>

                {/* list item */}
                <li>
                  <Link href="announcements">
                    <button
                      className="is-drawer-close:tooltip is-drawer-close:tooltip-right"
                      data-tip="Announcements"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeWidth="2"
                        fill="none"
                        stroke="currentColor"
                        className="inline-block size-6 my-1.5"
                      >
                        <path d="M20 7h-9"></path>
                        <path d="M14 17H5"></path>

                        <circle cx="17" cy="17" r="3"></circle>
                        <circle cx="7" cy="7" r="3"></circle>
                      </svg>
                      <span className="is-drawer-close:hidden">
                        Announcements
                      </span>
                    </button>
                  </Link>
                </li>
                {/* list item */}
                <li>
                  <Link href="events">
                    <button
                      className="is-drawer-close:tooltip is-drawer-close:tooltip-right"
                      data-tip="Events"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeWidth="2"
                        fill="none"
                        stroke="currentColor"
                        className="inline-block size-6 my-1.5"
                      >
                        <path d="M20 7h-9"></path>
                        <path d="M14 17H5"></path>

                        <circle cx="17" cy="17" r="3"></circle>
                        <circle cx="7" cy="7" r="3"></circle>
                      </svg>
                      <span className="is-drawer-close:hidden">Events</span>
                    </button>
                  </Link>
                </li>
                {/* list item */}
                <li>
                  <Link href="community-feedback">
                    <button
                      className="is-drawer-close:tooltip is-drawer-close:tooltip-right"
                      data-tip="Community Feedback"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeWidth="2"
                        fill="none"
                        stroke="currentColor"
                        className="inline-block size-6 my-1.5"
                      >
                        <path d="M20 7h-9"></path>
                        <path d="M14 17H5"></path>

                        <circle cx="17" cy="17" r="3"></circle>
                        <circle cx="7" cy="7" r="3"></circle>
                      </svg>
                      <span className="is-drawer-close:hidden">
                        Community Feedback
                      </span>
                    </button>
                  </Link>
                </li>
              </ul>

              {/* button to open/close drawer */}
              <div
                className="m-2 is-drawer-close:tooltip is-drawer-close:tooltip-right"
                data-tip="Open"
              >
                <label
                  htmlFor="my-drawer-4"
                  className="btn btn-ghost btn-circle drawer-button is-drawer-open:rotate-y-180"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeWidth="2"
                    fill="none"
                    stroke="currentColor"
                    className="inline-block size-6 my-1.5"
                  >
                    <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                    <path d="M9 4v16"></path>
                    <path d="M14 10l2 2l-2 2"></path>
                  </svg>
                </label>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
