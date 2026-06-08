"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ScheduledPost, PostLog } from "@/app/schemas/postScheduling";
import { fetchPostLogs, fetchAuditLogs } from "@/actions/postScheduling";
import PostStatusBadge from "./PostStatusBadge";
import PlatformIcons from "./PlatformIcons";
import PostPreview from "./PostPreview";

interface AuditLog {
  id: number;
  user_email: string | null;
  action: string;
  detail: string | null;
  occurred_at: string;
}

interface PostDetailProps {
  post: ScheduledPost & { events?: { id: number; title: string } };
  onClose: () => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram_feed: "Instagram Feed",
  instagram_story: "Instagram Story",
  whatsapp: "WhatsApp",
};

export default function PostDetail({ post, onClose }: PostDetailProps) {
  const [logs, setLogs] = useState<PostLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "preview" | "logs" | "history">("info");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    fetchPostLogs({ post_id: post.id }).then((res) => {
      if (res?.data?.data) setLogs(res.data.data as PostLog[]);
      setLogsLoading(false);
    });
    fetchAuditLogs({ entity_type: "scheduled_post", entity_id: post.id }).then((res) => {
      if (res?.data?.data) setAuditLogs(res.data.data as AuditLog[]);
      setAuditLoading(false);
    });
  }, [post.id]);

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  const eventId = post.events?.id ?? post.event_id;
  const eventTitle = post.events?.title ?? `Event #${eventId}`;

  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg">{post.post_type} Post</h3>
            <div className="flex items-center gap-2 mt-1">
              <PostStatusBadge status={post.status} />
              <span className="text-xs opacity-60">
                {post.scheduled_date} · {post.time_slot}
              </span>
              {post.retry_count > 0 && (
                <span className="badge badge-warning badge-xs">
                  retry {post.retry_count}
                </span>
              )}
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={handleClose}>✕</button>
        </div>

        {/* Event link */}
        <Link
          href={`/dashboard/events/${eventId}/posts`}
          className="text-xs text-primary underline mb-4 block"
          onClick={handleClose}
        >
          ↗ {eventTitle}
        </Link>

        {/* Tabs */}
        <div role="tablist" className="tabs tabs-bordered mb-4">
          {(["info", "preview", "logs", "history"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              className={`tab capitalize ${tab === t ? "tab-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "info" && (
          <div className="space-y-3 text-sm">
            <div className="flex gap-2 items-center">
              <span className="opacity-60 w-28">Platforms</span>
              <PlatformIcons platforms={post.platforms} />
              <span className="text-xs opacity-50">
                {post.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")}
              </span>
            </div>
            {post.caption && (
              <div>
                <span className="opacity-60 block mb-1">Caption</span>
                <p className="bg-base-200 rounded p-2 whitespace-pre-wrap text-xs">{post.caption}</p>
              </div>
            )}
            {post.hashtags && post.hashtags.length > 0 && (
              <div>
                <span className="opacity-60 block mb-1">Hashtags</span>
                <p className="text-xs text-primary">
                  {post.hashtags.map((h) => `#${h}`).join(" ")}
                </p>
              </div>
            )}
            {post.whatsapp_text && (
              <div>
                <span className="opacity-60 block mb-1">WhatsApp Text</span>
                <div className="relative">
                  <p className="bg-base-200 rounded p-2 whitespace-pre-wrap text-xs pr-16">
                    {post.whatsapp_text}
                  </p>
                  <button
                    className="btn btn-xs btn-ghost absolute top-1 right-1"
                    onClick={() => {
                      navigator.clipboard.writeText(post.whatsapp_text!);
                      toast.success("Copied!");
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            {post.banner_image_url && (
              <div>
                <span className="opacity-60 block mb-1">Banner Image</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.banner_image_url}
                  alt="Banner"
                  className="rounded max-h-40 object-cover"
                />
              </div>
            )}
            {post.requires_manual && (
              <div className="alert alert-warning text-xs py-2">
                This post requires manual publishing (WhatsApp Stories not yet automated).
              </div>
            )}
          </div>
        )}

        {tab === "preview" && <PostPreview post={post} />}

        {tab === "logs" && (
          <div>
            {logsLoading ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm opacity-50 text-center py-8">No logs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td>{log.platform ?? "—"}</td>
                        <td>
                          <PostStatusBadge status={log.status} />
                        </td>
                        <td className="max-w-xs truncate">{log.message ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div>
            {auditLoading ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner" />
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="text-sm opacity-50 text-center py-8">No history yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap">
                          {new Date(log.occurred_at).toLocaleString()}
                        </td>
                        <td className="max-w-[120px] truncate">{log.user_email ?? "—"}</td>
                        <td className="capitalize">{log.action}</td>
                        <td className="max-w-xs truncate">{log.detail ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop" onSubmit={handleClose}>
        <button>close</button>
      </form>
    </dialog>
  );
}
