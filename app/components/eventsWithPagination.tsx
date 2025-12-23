"use client";

import { useRef, useState } from "react";
import { Event } from "../schemas/events";
import EventCard from "./eventCard";
import Pagination from "./pagination";
import { deleteEvent, filterEvents } from "@/actions/events";
import { useForm, useWatch } from "react-hook-form";
import EventModal from "./eventModal";
import ConfirmationModal from "../../features/announcements/modals/ConfirmationModal";
import { ResponseCodes } from "../enums/responseCodes";

interface EventsWithPaginationProps {
  events: Event[];
  count: number;
}
export default function EventsWithPagination({
  events,
  count,
}: EventsWithPaginationProps) {
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
  const [filteredEvents, setFilteredEvents] = useState(events);
  const [selectedEvent, setSelectedEvent] = useState<Event | undefined>(
    undefined
  );

  const startDate = useWatch({ control, name: "startDate" });
  const endDate = useWatch({ control, name: "endDate" });
  const pageSize = useWatch({ control, name: "pageSize" });
  const currentPage = useWatch({ control, name: "currentPage" });
  const search = useWatch({ control, name: "search" });
  const addEditModalRef = useRef<HTMLDialogElement>(null);
  const deleteModalRef = useRef<HTMLDialogElement>(null);

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

    const query = await filterEvents(input);

    setFilteredEvents(query.data?.data.events ?? []);
    setTotalCount(query.data?.data.count ?? 0);
    window.scrollTo({ top: 0 });
  }

  function openModal(event?: Event) {
    setSelectedEvent(event);
    addEditModalRef.current?.showModal();
  }

  async function closeModal(reloadEvents = true) {
    addEditModalRef.current?.close();
    if (reloadEvents) {
      handleSubmit((data) =>
        onSubmit({
          ...data,
        })
      )();
    }
  }
  async function confirmDeleteEvent(confirmedAction?: string) {
    if (confirmedAction && confirmedAction !== "no") {
      const deletedEvent = await deleteEvent({
        id: selectedEvent?.id,
        action: confirmedAction,
        recurrence_rule_id: selectedEvent?.recurrence_rule_id,
        start_date: selectedEvent?.start_date,
      });
      if (deletedEvent.data?.status !== ResponseCodes.SUCCESS) {
        console.error(deletedEvent.data?.error);
      }
      handleSubmit((data) =>
        onSubmit({
          ...data,
        })
      )();
    }
    deleteModalRef.current?.close();
    setSelectedEvent(undefined);
  }
  function handleDeleteEvent(event: Event) {
    setSelectedEvent(event);
    deleteModalRef.current?.showModal();
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex p-6 gap-3 items-center justify-between">
          <div className="w-full">
            <div className="flex w-full">
              <label className="grow input relative">
                <input
                  type="search"
                  className="border-gray-300 rounded-lg"
                  placeholder="Search for an event by title"
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
                  <button className="btn rounded-l-lg btn-neutral">
                    Search
                  </button>
                </span>
              </label>
              <button
                className="btn btn-success"
                onClick={() => {
                  openModal();
                }}
              >
                Add New Event
              </button>
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

        {filteredEvents.length > 0 && (
          <div className="p-4 grid grid-cols-2 gap-4">
            {filteredEvents.map((event) => {
              return (
                <EventCard
                  key={event.id}
                  event={event}
                  editEvent={() => openModal(event)}
                  deleteEvent={() => handleDeleteEvent(event)}
                />
              );
            })}
          </div>
        )}
        {!filteredEvents.length && (
          <div className="flex justify-center items-center flex-col gap-3">
            <div>
              <p className="text-4xl"></p>
              <h1>
                🤔 Hmmm... there don&apos;t seem to be any events... Let&apos;s
                create some! 😃
              </h1>
            </div>
            <div>
              <button
                className="btn btn-success"
                onClick={() => {
                  openModal();
                }}
              >
                Add New Event
              </button>
            </div>
          </div>
        )}
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
      </form>
      <dialog ref={addEditModalRef} className="modal">
        <EventModal
          key={selectedEvent?.id || "new"}
          event={selectedEvent}
          closeModal={() => {
            closeModal();
          }}
        />
      </dialog>
      <dialog ref={deleteModalRef} className="modal">
        <ConfirmationModal
          buttons={
            selectedEvent?.is_recurring
              ? [
                  { value: "all", label: "All" },
                  { value: "future", label: "This and future" },
                  { value: "this", label: "Only This" },
                ]
              : [
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]
          }
          message={
            selectedEvent?.is_recurring
              ? "This is an instance of a recurring event. Do you want to delete all instances, just this instance, or this and future instances?"
              : "Are you sure you want to delete this event? This action cannot be undone."
          }
          closeModal={confirmDeleteEvent}
        />
      </dialog>
    </>
  );
}
