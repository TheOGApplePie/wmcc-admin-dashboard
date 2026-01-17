import Image from "next/image";
import { Announcement } from "../../../app/schemas/announcement";
import DeleteButton from "./DeleteButton";
import EditButton from "./EditButton";

export default function AnnouncementTable({
  announcements,
}: {
  announcements: Announcement[];
}) {
  if (!announcements.length) {
    return (
      <div className="py-4">
        <h2>There are no expired announcements</h2>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Poster</th>
          <th>Title</th>
          <th>Description</th>
          <th>Expired At</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {announcements.map((announcement) => {
          return (
            <tr key={announcement.id}>
              <td>
                {announcement.poster_url && (
                  <Image
                    width={50}
                    height={50}
                    src={announcement.poster_url ? announcement.poster_url : ""}
                    alt={
                      announcement.poster_alt
                        ? announcement.poster_alt
                        : "Poster Alt text"
                    }
                  />
                )}
              </td>
              <td>{announcement.title}</td>
              <td>{announcement.description}</td>
              <td>
                {new Date(announcement.expires_at).toLocaleTimeString("en-GB", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h12",
                })}
              </td>
              <td>
                <div className="flex gap-3">
                  <EditButton announcement={announcement} />
                  <DeleteButton announcement={announcement} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
