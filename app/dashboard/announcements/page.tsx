import { createClient } from "@/utils/supabase/server";
import Carousel from "../../components/Carousel";
import { Announcement } from "../../schemas/announcement";

export default async function Announcements() {
  const supabase = await createClient();

  const { data: announcements } = await supabase
    .from("announcements")
    .select()
    .overrideTypes<Announcement[]>();
  return (
    <div className="flex flex-col justify-center mx-16 mt-8 gap-8">
      <div>
        <h1 className="text-3xl font-bold">Announcements Configuration</h1>
      </div>
      <div className="flex">
        <div className="mockup-browser border border-base-300 w-full">
          <div className="mockup-browser-toolbar">
            <div className="input">https://www.wmcc.ca</div>
          </div>
          <div className="overflow-hidden place-content-center h-[75svh] bg-linear-to-r from-[#08101a] to-[#1e3a5f]">
            <Carousel announcements={announcements} />
          </div>
        </div>
      </div>
    </div>
  );
}
