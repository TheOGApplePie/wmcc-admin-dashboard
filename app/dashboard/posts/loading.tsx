export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-4 p-6">
      <div className="h-10 w-40 rounded-xl bg-line" />
      <div className="mt-2 flex flex-col gap-5 xl:flex-row">
        <div className="h-160 flex-1 rounded-2xl bg-line" />
        <div className="h-160 w-full rounded-2xl bg-line xl:w-96" />
      </div>
    </div>
  );
}
