import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Carousel from "../components/Carousel";
import { Announcement } from "../interfaces/announcement";

export default async function Announcements() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: announcements } = await supabase
    .from("announcements")
    .select()
    .overrideTypes<Announcement[]>();
  return (
    <div className="flex flex-col justify-center m-16 gap-8">
      <div>
        <h1 className="text-3xl font-bold">Announcements Configuration</h1>
      </div>
      <div className="flex ">
        <div className="mockup-browser border border-base-300 w-full">
          <div className="mockup-browser-toolbar">
            <div className="input">https://www.wmcc.ca</div>
          </div>
          <div className="grid grid-cols-1 place-content-center h-[75svh] bg-linear-to-r from-[#08101a] to-[#1e3a5f]">
            <div className="carousel col-span-1 justify-center">
              <Carousel announcements={announcements} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
