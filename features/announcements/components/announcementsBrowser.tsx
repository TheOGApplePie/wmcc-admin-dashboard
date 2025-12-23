"use client";
import { useState } from "react";
import { Announcement } from "../../../app/schemas/announcement";
import Carousel from "./Carousel";

interface AnnouncementBrowserProps {
  announcements: Announcement[] | null;
}
export default function AnnouncementBrowser({
  announcements,
}: Readonly<AnnouncementBrowserProps>) {
  const [showMobile, setShowMobile] = useState(false);
  return (
    <div
      className={`transform transition-all duration-700 ease-out mockup-browser border border-base-300 ${
        showMobile ? "w-[450]" : "w-7xl"
      }`}
    >
      <div className="mockup-browser-toolbar">
        <div className="input input-lg border active:border-0 focus:border-0 focus-within:border-0 relative">
          https://www.wmcc.ca
          <div className="absolute right-0 top-0">
            <label className="toggle toggle-lg text-base-content p-0 m-0 text-center justify-center">
              <input
                type="checkbox"
                checked={showMobile}
                onChange={() => setShowMobile(!showMobile)}
              />
              <svg
                aria-label="disabled"
                width="24px"
                height="24px"
                viewBox="0 -1 25 25"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                stroke="#ffffff"
                strokeWidth="0.65"
              >
                <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                <g
                  id="SVGRepo_tracerCarrier"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                ></g>
                <g id="SVGRepo_iconCarrier">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M2 6C2 4.34315 3.34315 3 5 3H19C20.6569 3 22 4.34315 22 6V15C22 16.6569 20.6569 18 19 18H13V19H15C15.5523 19 16 19.4477 16 20C16 20.5523 15.5523 21 15 21H9C8.44772 21 8 20.5523 8 20C8 19.4477 8.44772 19 9 19H11V18H5C3.34315 18 2 16.6569 2 15V6ZM5 5C4.44772 5 4 5.44772 4 6V15C4 15.5523 4.44772 16 5 16H19C19.5523 16 20 15.5523 20 15V6C20 5.44772 19.5523 5 19 5H5Z"
                    fill="#ffffff"
                  ></path>
                </g>
              </svg>

              <svg
                aria-label="enabled"
                width="20px"
                height="20px"
                viewBox="0 0 21 21"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                <g
                  id="SVGRepo_tracerCarrier"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  stroke="#FFFFFF"
                  strokeWidth="1"
                ></g>
                <g id="SVGRepo_iconCarrier">
                  <path
                    d="M12 18H12.01M9.2 21H14.8C15.9201 21 16.4802 21 16.908 20.782C17.2843 20.5903 17.5903 20.2843 17.782 19.908C18 19.4802 18 18.9201 18 17.8V6.2C18 5.0799 18 4.51984 17.782 4.09202C17.5903 3.71569 17.2843 3.40973 16.908 3.21799C16.4802 3 15.9201 3 14.8 3H9.2C8.0799 3 7.51984 3 7.09202 3.21799C6.71569 3.40973 6.40973 3.71569 6.21799 4.09202C6 4.51984 6 5.07989 6 6.2V17.8C6 18.9201 6 19.4802 6.21799 19.908C6.40973 20.2843 6.71569 20.5903 7.09202 20.782C7.51984 21 8.07989 21 9.2 21Z"
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></path>
                </g>
              </svg>
            </label>
          </div>
        </div>
      </div>
      <div className="@container overflow-hidden place-content-center h-[75svh] bg-linear-to-r from-[#08101a] to-[#1e3a5f]">
        <Carousel announcements={announcements} />
      </div>
    </div>
  );
}
