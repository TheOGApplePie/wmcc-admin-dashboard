"use client";

import type { Announcement } from "@/app/schemas/announcement";
import { Icon } from "@/app/components/ui/Icon";
import { isScheduled, isExpired } from "../announcementUtils";

const DESKTOP_ICON =
  "M2 6C2 4.34315 3.34315 3 5 3H19C20.6569 3 22 4.34315 22 6V15C22 16.6569 20.6569 18 19 18H13V19H15C15.5523 19 16 19.4477 16 20C16 20.5523 15.5523 21 15 21H9C8.44772 21 8 20.5523 8 20C8 19.4477 8.44772 19 9 19H11V18H5C3.34315 18 2 16.6569 2 15V6Z";
const MOBILE_ICON =
  "M9.2 21H14.8C15.9201 21 16.4802 21 16.908 20.782C17.2843 20.5903 17.5903 20.2843 17.782 19.908C18 19.4802 18 18.9201 18 17.8V6.2C18 5.0799 18 4.51984 17.782 4.09202C17.5903 3.71569 17.2843 3.40973 16.908 3.21799C16.4802 3 15.9201 3 14.8 3H9.2C8.0799 3 7.51984 3 7.09202 3.21799C6.71569 3.40973 6.40973 3.71569 6.21799 4.09202C6 4.51984 6 5.07989 6 6.2V17.8C6 18.9201 6 19.4802 6.21799 19.908C6.40973 20.2843 6.71569 20.5903 7.09202 20.782C7.51984 21 8.07989 21 9.2 21Z M12 18H12.01";

export default function PreviewHeader({ selected, isLive, isMobile, onDeviceChange }: Readonly<{
  selected: Announcement | null;
  isLive: boolean;
  isMobile: boolean;
  onDeviceChange: (isMobile: boolean) => void;
}>) {
  const isSelectedExpired = selected ? isExpired(selected) : false;
  return (
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <span className="text-[12px] font-semibold text-muted">
            {isLive ? "Live preview" : "Preview"}
          </span>
          {((selected && isScheduled(selected)) || isSelectedExpired) && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-muted" />
              {selected && isScheduled(selected)
                ? "Scheduled · not on site"
                : "Archived · not on site"}
            </span>
          )}
          <div className="flex-1" />
          {/* Device toggle */}
          <div className="flex items-center gap-0.5 rounded-xl bg-canvas border border-line p-1">
            {(["desktop", "mobile"] as const).map((device) => {
              const active = isMobile
                ? device === "mobile"
                : device === "desktop";
              return (
                <button
                  key={device}
                  onClick={() => onDeviceChange(device === "mobile")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-ink text-white shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon
                    d={device === "desktop" ? DESKTOP_ICON : MOBILE_ICON}
                    size={13}
                  />
                  {device === "desktop" ? "Desktop" : "Mobile"}
                </button>
              );
            })}
          </div>
        </div>
  );
}
