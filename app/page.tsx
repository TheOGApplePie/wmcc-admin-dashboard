export default function Home() {
  return (
    <div className="flex min-h-dvh items-center justify-center ">
      <main className="flex flex-col items-center justify-between">
        <div className="rounded-2xl hero bg-base-200 py-32 px-16">
          <div className="hero-content text-center ">
            <div className="max-w-md">
              <h1 className="text-5xl font-bold">Assalamualaikum</h1>
              <p className="py-6">
                Welcome to the wmcc website admin dashboard. Select a menu
                option on the left to get started or select an item below.
              </p>
              <div className="flex gap-1">
                <button className="btn btn-primary btn-lg">
                  Announcements
                </button>
                <button className="btn btn-primary btn-lg">Events</button>
                <button className="btn btn-primary btn-lg">
                  Community Feedback
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
