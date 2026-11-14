export default function LoadingEventLibrary() {
  return <div className="p-7" role="status" aria-label="Loading event library">
    <div className="mb-6 h-10 rounded-xl bg-teal-soft" />
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-line"><div className="aspect-[3/4] bg-teal-soft" /><div className="h-64 bg-surface" /></div>)}
    </div>
  </div>;
}
