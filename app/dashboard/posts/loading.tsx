export default function Loading() {
  return (
    <div className="animate-pulse flex flex-col gap-4 p-6">
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 h-20 rounded-2xl" style={{ backgroundColor: "var(--sp-hairline)" }} />
        ))}
      </div>
      <div className="flex gap-5 mt-2">
        <div className="flex-[3] h-64 rounded-2xl" style={{ backgroundColor: "var(--sp-hairline)" }} />
        <div className="flex-[2] h-64 rounded-2xl" style={{ backgroundColor: "var(--sp-hairline)" }} />
      </div>
    </div>
  );
}
