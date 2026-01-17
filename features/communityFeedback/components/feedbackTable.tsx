"use client";
import Pagination from "@/app/components/pagination";
import { CommunityFeedback } from "@/app/schemas/communityFeedback";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { fetchFeedback } from "../actions";

export default function FeedbackTable({
  feedback,
  count,
}: Readonly<{
  feedback: CommunityFeedback[];
  count: number;
}>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    resetField,
    control,
    setValue,
  } = useForm<{
    search: string;
    startDate: string;
    endDate: string;
    currentPage: number;
    pageSize: number;
  }>({
    defaultValues: {
      search: "",
      startDate: "",
      endDate: "",
      currentPage: 1,
      pageSize: 10,
    },
    mode: "onChange",
  });

  const [totalCount, setTotalCount] = useState(count);
  const [filteredFeedback, setFilteredFeedback] = useState(feedback);

  const startDate = useWatch({ control, name: "startDate" });
  const endDate = useWatch({ control, name: "endDate" });
  const pageSize = useWatch({ control, name: "pageSize" });
  const currentPage = useWatch({ control, name: "currentPage" });
  const search = useWatch({ control, name: "search" });
  const [selectedFeedback, setSelectedFeedback] =
    useState<null | CommunityFeedback>(null);

  async function onSubmit(data: {
    search: string;
    startDate: string;
    endDate: string;
    currentPage: number;
    pageSize: number;
  }) {
    let input: {
      search: string;
      startDate: string | undefined;
      endDate: string | undefined;
      currentPage: number;
      pageSize: number;
    } = {
      search: data.search,
      startDate: undefined,
      endDate: undefined,
      currentPage: data.currentPage,
      pageSize: data.pageSize,
    };

    if (data.startDate?.length) {
      input = { ...input, startDate: data.startDate };
    }
    if (data.endDate?.length) {
      input = { ...input, endDate: data.endDate };
    }

    const query = await fetchFeedback(input);

    setFilteredFeedback(query.data?.feedback ?? []);
    setTotalCount(query.data?.count ?? 0);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="flex justify-center">
      <div>
        <div className="flex px-6 pt-6 gap-3 items-center justify-between">
          <div className="w-full">
            <div className="flex w-full">
              <label className="grow input relative">
                <input
                  type="search"
                  className="border-gray-300 rounded-lg"
                  placeholder="Search feedback by message contents"
                  {...register("search")}
                />
                {search.length > 0 && (
                  <button
                    className="btn btn-error btn-sm"
                    type="reset"
                    onClick={() => {
                      resetField("search");
                    }}
                  >
                    X
                  </button>
                )}
                <span className="label p-0">
                  <button
                    type="submit"
                    className="btn rounded-l-lg btn-neutral"
                  >
                    Search
                  </button>
                </span>
              </label>
            </div>
            <div className="flex gap-3 justify-start items-center py-3">
              <div className="font-semibold">Filter By Date Range</div>
              <label className="input">
                <span className="label">From</span>
                <input
                  className="relative"
                  type="date"
                  {...register("startDate", {
                    validate: {
                      validateStartDate: (
                        startDate: string,
                        {
                          endDate,
                        }: {
                          endDate: string | null;
                        }
                      ) => {
                        if (
                          startDate &&
                          endDate &&
                          new Date(startDate) > new Date(endDate)
                        )
                          return "Please make sure the 'from' date is less than the 'to' date";
                        return true;
                      },
                    },
                  })}
                />
                {startDate && (
                  <button
                    className="btn absolute btn-error btn-sm right-10 text-red-500"
                    onClick={() => {
                      resetField("startDate");
                    }}
                  >
                    X
                  </button>
                )}
              </label>

              <label className="input">
                <span className="label">To</span>
                <input
                  className="relative"
                  type="date"
                  {...register("endDate", {
                    validate: {
                      validateEndDate: (
                        endDate: string,
                        {
                          startDate,
                        }: {
                          startDate: string | null;
                        }
                      ) => {
                        if (
                          startDate &&
                          endDate &&
                          new Date(startDate) > new Date(endDate)
                        )
                          return "Please make sure the 'from' date is less than the 'to' date";
                        return true;
                      },
                    },
                  })}
                />
                {endDate && (
                  <button
                    className="btn absolute btn-error btn-sm right-10 text-red-500"
                    onClick={() => {
                      resetField("endDate");
                    }}
                  >
                    X
                  </button>
                )}
              </label>
              <button
                className="btn btn-small btn-info"
                onClick={() => {
                  handleSubmit(onSubmit);
                }}
              >
                Apply Date Filters
              </button>
            </div>
            {errors.startDate && (
              <span className="text-red-500">{errors.startDate.message}</span>
            )}
            {errors.endDate && (
              <span className="text-red-500">{errors.endDate.message}</span>
            )}
          </div>
        </div>
        <div className="mx-10 mb-10 border border-gray-200 shadow-lg rounded-3xl">
          <table className="table">
            <thead>
              <tr>
                <th>Sender Name</th>
                <th>Sender Message</th>
                <th>Sender Email</th>
                <th>Sender Telephone</th>
                <th>Date Sent</th>
              </tr>
            </thead>
            <tbody>
              {filteredFeedback.map((message) => {
                return (
                  <tr
                    className={`hover:cursor-pointer hover:bg-gray-200 transition ${
                      selectedFeedback?.id === message.id ? "bg-gray-300" : ""
                    }`}
                    onClick={() => setSelectedFeedback(message)}
                    key={message.id}
                  >
                    <td>{message.name}</td>
                    <td className="overflow-hidden text-ellipsis max-w-28">
                      {message.message}
                    </td>
                    <td>{message.email}</td>
                    <td>{message.telephone}</td>
                    <td>
                      {new Date(message.created_at).toLocaleTimeString(
                        "en-GB",
                        {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hourCycle: "h12",
                        }
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalCount > 10 && (
            <div className="p-3">
              <Pagination
                currentPage={currentPage}
                total={totalCount}
                limit={pageSize}
                onPageChange={(page: number, newPageSize?: number) => {
                  setValue("currentPage", page);
                  if (newPageSize) {
                    setValue("pageSize", newPageSize);
                  }
                  handleSubmit((data) =>
                    onSubmit({
                      ...data,
                      pageSize: newPageSize ?? pageSize,
                      currentPage: page,
                    })
                  )();
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div
        className={`${
          selectedFeedback ? "w-96 h-[500px] opacity-100" : "w-0 opacity-0 h-0"
        } transition-all ease-out duration-300 m-10 p-10 border border-gray-200 shadow-lg rounded-3xl`}
      >
        <div className="flex justify-between">
          <h2>Message Details</h2>
          <button
            className="btn btn-error"
            onClick={() => setSelectedFeedback(null)}
          >
            X
          </button>
        </div>
        <div>
          <div>
            <h3>Name: </h3>
            {selectedFeedback?.name}
          </div>
          <div>
            <h3>Email: </h3>
            {selectedFeedback?.email}
          </div>
          <div>
            <h3>Phone Number: </h3>
            {selectedFeedback?.telephone
              ? selectedFeedback.telephone
              : "None Provided"}
          </div>
          <div>
            <h3>Message: </h3>
            <textarea
              readOnly={true}
              className="bg-gray-200 resize-none w-full"
              value={selectedFeedback?.message}
            ></textarea>
          </div>
          <div className="my-3">
            <button className="btn btn-neutral">
              <Link
                href={`mailto:${
                  selectedFeedback?.email
                }?subject=RE:${selectedFeedback?.message.substring(0, 20)}`}
              >
                Email Back
              </Link>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
