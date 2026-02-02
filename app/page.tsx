import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-20">
        <div className="space-y-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
            TenXEng Daily System Design
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Daily AI-powered system design drills for backend engineers.
          </h1>
          <p className="max-w-2xl text-lg text-slate-300">
            Get 5 multiple-choice questions every day, track your progress, and
            level up your architecture intuition with Gemini-generated prompts.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="rounded-full bg-white px-6 py-3 text-center font-medium text-slate-900 hover:bg-slate-200"
            href="/signup"
          >
            Create account
          </Link>
          <Link
            className="rounded-full border border-slate-700 px-6 py-3 text-center font-medium text-white hover:border-slate-400"
            href="/login"
          >
            Sign in
          </Link>
        </div>
        <div className="grid gap-6 text-sm text-slate-400 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 p-5">
            Personalized daily sets with explanations.
          </div>
          <div className="rounded-2xl border border-slate-800 p-5">
            Track accuracy and streaks over time.
          </div>
          <div className="rounded-2xl border border-slate-800 p-5">
            Focused on real system design trade-offs.
          </div>
        </div>
      </main>
    </div>
  );
}
