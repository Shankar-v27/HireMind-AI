import Link from "next/link";
import { SplineSceneBasic } from "@/components/landing/spline-scene-basic";

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 4L24 12H16L20 4Z" fill="url(#logoGrad)" />
      <path d="M12 16L20 20L28 16L20 36L12 16Z" fill="url(#logoGrad)" />
      <path d="M4 20L12 16L20 20L12 24L4 20Z" fill="url(#logoGrad)" />
      <path d="M36 20L28 24L20 20L28 16L36 20Z" fill="url(#logoGrad)" />
      <defs>
        <linearGradient id="logoGrad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fafafa" />
          <stop offset="1" stopColor="#a1a1aa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const FEATURES = [
  {
    title: "AI-Powered Interviews",
    description: "LLM-driven question generation, evaluation, and scoring across all round types.",
    icon: "brain",
  },
  {
    title: "Integrated Coding IDE",
    description: "Built-in code editor with test case execution, similar to LeetCode and Codeforces.",
    icon: "code",
  },
  {
    title: "Smart Proctoring",
    description: "Face detection, voice analysis, tab-lock, and phone detection to ensure integrity.",
    icon: "shield",
  },
  {
    title: "Voice-Based Interviews",
    description: "Text-to-speech questions with speech-to-text answers, scored by AI in real-time.",
    icon: "mic",
  },
  {
    title: "Group Discussions",
    description: "Multi-candidate discussion threads evaluated by AI on contribution and knowledge.",
    icon: "users",
  },
  {
    title: "Analytics & Reports",
    description: "Comprehensive dashboards with candidate performance metrics and round-wise breakdowns.",
    icon: "chart",
  },
];

const STEPS = [
  { num: "01", title: "Create Interview", desc: "Configure rounds, upload candidates, set evaluation criteria." },
  { num: "02", title: "AI Conducts Rounds", desc: "From aptitude to technical interviews, AI handles the entire pipeline." },
  { num: "03", title: "Review & Hire", desc: "Get AI-scored results, candidate rankings, and role-fit recommendations." },
];

function FeatureIcon({ name }: { name: string }) {
  const c = "h-8 w-8 text-zinc-400";
  if (name === "brain")
    return (
      <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    );
  if (name === "code")
    return (
      <span className={`${c} flex items-center justify-center font-mono text-xl font-bold`}>&lt;/&gt;</span>
    );
  if (name === "shield")
    return (
      <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    );
  if (name === "mic")
    return (
      <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    );
  if (name === "users")
    return (
      <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    );
  if (name === "chart")
    return (
      <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    );
  return null;
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <LogoIcon className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight">HireMind AI</span>
          </Link>
        </div>
      </header>

      <main className="pt-16">
        <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 md:pt-16">
          <div className="relative mx-auto flex max-w-6xl flex-col gap-6">
            <SplineSceneBasic />
          </div>
        </section>

        <section id="features" className="border-t border-white/10 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Everything You Need to Hire at Scale</h2>
            <p className="mx-auto mt-3 max-w-2xl text-zinc-500">
              A complete platform that handles every stage of hiring with AI precision and human oversight when you need it.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-white/10 bg-zinc-950/80 p-6 text-left backdrop-blur-sm transition hover:border-white/20"
                >
                  <div className="mb-4">
                    <FeatureIcon name={f.icon} />
                  </div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-zinc-500">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-white/10 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">How It Works</h2>
            <p className="mx-auto mt-3 max-w-xl text-zinc-500">
              Three simple steps to transform your hiring process.
            </p>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.num} className="relative rounded-2xl border border-white/10 bg-zinc-950/60 p-6 text-left">
                  <span className="text-6xl font-bold text-white/[0.06]">{s.num}</span>
                  <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-zinc-500">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-8 text-center sm:p-12">
              <h2 className="text-2xl font-bold sm:text-3xl">Ready to Transform Your Hiring?</h2>
              <p className="mt-3 text-zinc-500">
                Join companies that are hiring smarter and faster with AI-driven assessments.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Get Started Now
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 px-4 py-8 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
            <Link href="/" className="flex items-center gap-2 text-zinc-500 hover:text-white">
              <LogoIcon className="h-6 w-6" />
              <span className="font-medium">HireMind AI</span>
            </Link>
            <p className="text-sm text-zinc-600">© 2026 HireMind AI. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
