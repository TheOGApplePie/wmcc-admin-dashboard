import Link from "next/link";
import SignoutButton from "../components/signoutButton";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="navbar bg-base-100 shadow-sm">
        <div className="flex-1">
          <Link href="/" className="btn btn-ghost text-xl">
            WMCC Admin Dashboard
          </Link>
        </div>
        <div className="flex-none">
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle avatar"
            >
              <div className="w-10 rounded-full">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="inline-block h-5 w-5 stroke-current"
                >
                  {" "}
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                  ></path>{" "}
                </svg>
              </div>
            </div>
            <ul
              tabIndex={-1}
              className="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 p-2 shadow"
            >
              <li>
                <SignoutButton />
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="drawer drawer-open">
        <input id="my-drawer-4" type="checkbox" className="drawer-toggle" />
        <div className="drawer-content">{children}</div>

        <div className="bg-base-100 shadow-sm drawer-side is-drawer-close:overflow-visible is-drawer-close:text-nowrap">
          <label
            htmlFor="my-drawer-4"
            aria-label="close sidebar"
            className="drawer-overlay"
          ></label>
          <div className="is-drawer-close:w-20 is-drawer-open:w-64 flex flex-col items-start min-h-full">
            {/* Sidebar content here */}
            <ul className="menu w-full grow">
              {/* list item */}
              <li>
                <Link href={"/"}>
                  <button
                    className="is-drawer-close:tooltip is-drawer-close:tooltip-right hover:cursor-pointer"
                    data-tip="Homepage"
                  >
                    <svg
                      width={40}
                      height={40}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 32 32"
                    >
                      <path
                        fill="none"
                        stroke="#000"
                        strokeWidth="2"
                        strokeMiterlimit="10"
                        d="M3 17 16 4l13 13"
                      />
                      <path
                        fill="none"
                        stroke="#000"
                        strokeWidth="2"
                        strokeMiterlimit="10"
                        d="M6 14v13h7V17h6v10h7V14"
                      />
                    </svg>
                    <span className="is-drawer-close:hidden">Homepage</span>
                  </button>
                </Link>
              </li>

              {/* list item */}
              <li>
                <Link href="/dashboard/announcements">
                  <button
                    className="is-drawer-close:tooltip is-drawer-close:tooltip-right hover:cursor-pointer"
                    data-tip="Announcements"
                  >
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 1920 1920"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1587.162 31.278c11.52-23.491 37.27-35.689 63.473-29.816 25.525 6.099 43.483 28.8 43.483 55.002V570.46C1822.87 596.662 1920 710.733 1920 847.053s-97.13 250.503-225.882 276.705v513.883c0 26.202-17.958 49.016-43.483 55.002a57.3 57.3 0 0 1-12.988 1.468c-21.12 0-40.772-11.745-50.485-31.171C1379.238 1247.203 964.18 1242.347 960 1242.347H564.706v564.706h87.755c-11.859-90.127-17.506-247.003 63.473-350.683 52.405-67.087 129.657-101.082 229.948-101.082v112.941c-64.49 0-110.57 18.861-140.837 57.487-68.781 87.868-45.064 263.83-30.269 324.254 4.18 16.828.34 34.673-10.277 48.34-10.73 13.665-27.219 21.684-44.499 21.684H508.235c-31.171 0-56.47-25.186-56.47-56.47v-621.177h-56.47c-155.747 0-282.354-126.607-282.354-282.353v-56.47h-56.47C25.299 903.523 0 878.336 0 847.052c0-31.172 25.299-56.471 56.47-56.471h56.471v-56.47c0-155.634 126.607-282.354 282.353-282.354h564.593c16.941-.112 420.48-7.002 627.275-420.48Zm-5.986 218.429c-194.71 242.371-452.216 298.164-564.705 311.04v572.724c112.489 12.876 369.995 68.556 564.705 311.04ZM903.53 564.7H395.294c-93.402 0-169.412 76.01-169.412 169.411v225.883c0 93.402 76.01 169.412 169.412 169.412H903.53zm790.589 123.444v317.93c65.618-23.379 112.94-85.497 112.94-159.021 0-73.525-47.322-135.53-112.94-158.909"
                        fillRule="evenodd"
                      />
                    </svg>

                    <span className="p-3 is-drawer-close:hidden">
                      Announcements
                    </span>
                  </button>
                </Link>
              </li>
              {/* list item */}
              <li>
                <Link href="/dashboard/events">
                  <button
                    className="is-drawer-close:tooltip is-drawer-close:tooltip-right hover:cursor-pointer"
                    data-tip="Events"
                  >
                    <svg
                      width={40}
                      height={40}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                    >
                      <path d="M6 2v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-1V2h-2v2H8V2zM5 9h14v11H5z" />
                      <path d="m15.9 18.3-2.4-1.5-2.5 1.5.6-2.7-2.1-1.8 2.8-.2 1.1-2.6 1.1 2.6 2.8.3-2.1 1.8z" />
                      <path fill="none" d="M0 0h24v24H0z" />
                    </svg>
                    <span className="p-3 is-drawer-close:hidden">Events</span>
                  </button>
                </Link>
              </li>
              {/* list item */}
              <li>
                <Link href="/dashboard/community-feedback">
                  <button
                    className="is-drawer-close:tooltip is-drawer-close:tooltip-right hover:cursor-pointer"
                    data-tip="Community Feedback"
                  >
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 16 16"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M7.549 10.078q.69.273 1.258.725.567.451.97 1.046a4.83 4.83 0 0 1 .848 2.714V15H9.75v-.438a3.9 3.9 0 0 0-1.155-2.782 4 4 0 0 0-1.251-.84 3.9 3.9 0 0 0-1.532-.315A3.9 3.9 0 0 0 3.03 11.78a4.1 4.1 0 0 0-.84 1.251q-.308.712-.315 1.531V15H1v-.438a4.7 4.7 0 0 1 .848-2.713 4.9 4.9 0 0 1 2.229-1.77 3 3 0 0 1-.555-.493 3.2 3.2 0 0 1-.417-.602 3 3 0 0 1-.26-.683 3.4 3.4 0 0 1-.095-.739q0-.635.24-1.189a3.1 3.1 0 0 1 1.626-1.627 3.07 3.07 0 0 1 2.386-.007 3.1 3.1 0 0 1 1.627 1.627 3.07 3.07 0 0 1 .157 1.928q-.09.355-.266.684a3.5 3.5 0 0 1-.417.608q-.24.28-.554.492M5.812 9.75q.452 0 .848-.17a2.2 2.2 0 0 0 1.162-1.163Q8 8.013 8 7.563a2.14 2.14 0 0 0-.643-1.538 2.4 2.4 0 0 0-.697-.472 2.05 2.05 0 0 0-.848-.178q-.45 0-.847.17a2.22 2.22 0 0 0-1.17 1.17q-.17.396-.17.848 0 .45.17.847.172.396.466.697a2.17 2.17 0 0 0 1.552.643zM15 1v7h-1.75l-2.625 2.625V8H9.75v-.875h1.75v1.388l1.388-1.388h1.237v-5.25h-8.75v1.572a7 7 0 0 0-.438.069 2.6 2.6 0 0 0-.437.123V1z" />
                    </svg>
                    <span className="p-3 is-drawer-close:hidden">
                      Community Feedback
                    </span>
                  </button>
                </Link>
              </li>
              <li>
                <Link href="/dashboard/users-management">
                  <button
                    className="is-drawer-close:tooltip is-drawer-close:tooltip-right hover:cursor-pointer"
                    data-tip="User Management"
                  >
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M10 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 8a6 6 0 1 1 12 0A6 6 0 0 1 4 8m12.828-4.243a1 1 0 0 1 1.415 0 6 6 0 0 1 0 8.486 1 1 0 1 1-1.415-1.415 4 4 0 0 0 0-5.656 1 1 0 0 1 0-1.415m.702 13a1 1 0 0 1 1.212-.727c1.328.332 2.169 1.18 2.652 2.148.468.935.606 1.98.606 2.822a1 1 0 1 1-2 0c0-.657-.112-1.363-.394-1.928-.267-.533-.677-.934-1.349-1.102a1 1 0 0 1-.727-1.212zM6.5 18C5.24 18 4 19.213 4 21a1 1 0 1 1-2 0c0-2.632 1.893-5 4.5-5h7c2.607 0 4.5 2.368 4.5 5a1 1 0 1 1-2 0c0-1.787-1.24-3-2.5-3z"
                        fill="#0D0D0D"
                      />
                    </svg>
                  </button>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
