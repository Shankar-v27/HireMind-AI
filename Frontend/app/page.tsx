"use client";

import Link from "next/link";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authApi, getApiErrorMessage, setToken, setRefreshToken } from "@/lib/api";

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 4L24 12H16L20 4Z" fill="url(#logoGrad)" />
      <path d="M12 16L20 20L28 16L20 36L12 16Z" fill="url(#logoGrad)" />
      <path d="M4 20L12 16L20 20L12 24L4 20Z" fill="url(#logoGrad)" />
      <path d="M36 20L28 24L20 20L28 16L36 20Z" fill="url(#logoGrad)" />
      <defs>
        <linearGradient id="logoGrad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function RobotIllustration() {
  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Reference-accurate robot: translucent slate body, light blue outlines, lavender accents */}
      <div className="hero-robot-ai relative flex min-h-[280px] min-w-[200px] items-end justify-center md:min-h-[320px] md:min-w-[240px]">
        {/* Subtle particle specks (faint white/light blue) */}
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="ai-robot-particle absolute h-1 w-1 rounded-full bg-cyan-300/50 md:h-1.5 md:w-1.5"
            style={{
              left: `${8 + (i * 7) % 84}%`,
              top: `${6 + (i * 9) % 88}%`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
        {/* Robot as SVG: blocky, glowing light blue outline, lavender eyes/mouth/antenna/panel */}
        <svg
          className="ai-robot-body relative h-[240px] w-[160px] md:h-[280px] md:w-[200px]"
          viewBox="0 0 160 240"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="robot-glow-blue" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="robot-glow-lavender" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="robot-body-fill" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#1e293b" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="robot-panel-fill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#475569" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#334155" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          {/* Antenna orb (light purple, halo) */}
          <circle cx="80" cy="18" r="6" fill="#c4b5fd" filter="url(#robot-glow-lavender)" opacity="0.95" />
          <circle cx="80" cy="18" r="8" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
          {/* Head: square, rounded, slate + light blue outline */}
          <rect x="52" y="28" width="56" height="52" rx="6" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="2" filter="url(#robot-glow-blue)" />
          {/* Eyes: horizontal elongated rectangles, lavender */}
          <rect x="62" y="42" width="14" height="6" rx="1" fill="#c4b5fd" filter="url(#robot-glow-lavender)" />
          <rect x="84" y="42" width="14" height="6" rx="1" fill="#c4b5fd" filter="url(#robot-glow-lavender)" />
          {/* Mouth: thin line */}
          <line x1="68" y1="62" x2="92" y2="62" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" filter="url(#robot-glow-lavender)" />
          {/* Torso: rectangle, slightly wider, rounded */}
          <rect x="48" y="84" width="64" height="72" rx="8" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="2" filter="url(#robot-glow-blue)" />
          {/* Internal panel: two lines (short, long) + circle below */}
          <rect x="68" y="98" width="24" height="32" rx="4" fill="url(#robot-panel-fill)" stroke="#94a3b8" strokeWidth="1" opacity="0.9" />
          <line x1="74" y1="108" x2="86" y2="108" stroke="#c4b5fd" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
          <line x1="72" y1="118" x2="88" y2="118" stroke="#c4b5fd" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
          <circle cx="80" cy="128" r="4" fill="#c4b5fd" filter="url(#robot-glow-lavender)" />
          {/* Shoulder joints */}
          <circle cx="40" cy="108" r="8" fill="#334155" fillOpacity="0.9" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" />
          <circle cx="120" cy="108" r="8" fill="#334155" fillOpacity="0.9" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" />
          {/* Left arm: upper segment + elbow joint + L-shaped forearm (down then inward) */}
          <rect x="32" y="102" width="20" height="10" rx="2" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" transform="rotate(-15 42 107)" />
          <circle cx="50" cy="114" r="5" fill="#334155" fillOpacity="0.9" stroke="#7dd3fc" strokeWidth="1" />
          <rect x="44" y="116" width="10" height="32" rx="2" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" />
          <rect x="48" y="144" width="18" height="10" rx="2" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" />
          {/* Right arm: upper + elbow + L-shaped forearm (down then inward) */}
          <rect x="108" y="102" width="20" height="10" rx="2" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" transform="rotate(15 118 107)" />
          <circle cx="110" cy="114" r="5" fill="#334155" fillOpacity="0.9" stroke="#7dd3fc" strokeWidth="1" />
          <rect x="106" y="116" width="10" height="32" rx="2" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" />
          <rect x="94" y="144" width="18" height="10" rx="2" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" />
          {/* Hip joints */}
          <circle cx="68" cy="158" r="6" fill="#334155" fillOpacity="0.9" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" />
          <circle cx="92" cy="158" r="6" fill="#334155" fillOpacity="0.9" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" />
          {/* Legs: thick rectangular columns */}
          <rect x="54" y="162" width="22" height="56" rx="4" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" className="ai-robot-leg-l" />
          <rect x="84" y="162" width="22" height="56" rx="4" fill="url(#robot-body-fill)" stroke="#7dd3fc" strokeWidth="1.5" filter="url(#robot-glow-blue)" className="ai-robot-leg-r" />
        </svg>
      </div>
      <p className="ai-robot-tagline mt-6 text-sm font-semibold tracking-[0.3em] text-cyan-300">AI POWERED</p>
    </div>
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
  const c = "h-8 w-8 text-indigo-300";
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
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(email, password);
      setToken(res.data.access_token);
      if (res.data.refresh_token) setRefreshToken(res.data.refresh_token);
      const role = res.data.role || (await authApi.me()).data.role;
      if (role === "candidate") sessionStorage.setItem("hiremind_just_logged_in", "1");
      setAuthOpen(false);
      if (role === "admin") router.push("/dashboard/admin");
      else if (role === "candidate") router.push("/dashboard/candidate");
      else router.push("/dashboard/company");
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: unknown }; status?: number }; message?: string; code?: string };
      if (axErr?.response?.status === 401) {
        setError(getApiErrorMessage(axErr?.response?.data?.detail, "Incorrect email or password."));
      } else if (!axErr?.response && (axErr?.code === "ERR_NETWORK" || axErr?.message?.toLowerCase().includes("network"))) {
        setError("Cannot reach the API. Make sure the backend is running at " + (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"));
      } else {
        setError(getApiErrorMessage(axErr?.response?.data?.detail, axErr?.message || "Login failed."));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1A182F] via-[#1A182F] to-[#16142a] text-white">
      {/* Header */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/5 bg-[#1A182F]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <LogoIcon className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight">HireMind AI</span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            Sign In
          </Link>
        </div>
      </header>

      <main className="pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 md:pt-16">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.15),transparent)]" />
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                <LogoIcon className="h-4 w-4" />
                AI-Driven Hiring Platform
              </div>
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-5xl">
                Hire Smarter with AI
                <br />
                <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  Intelligence
                </span>
              </h1>
              <p className="text-slate-400">
                Automate your entire hiring pipeline — from aptitude tests to technical interviews. AI generates questions, evaluates responses, and ranks candidates in real-time.
              </p>
              <p className="text-sm italic text-slate-500">
                &ldquo;I&apos;d rather interview 50 people and not hire anyone than hire the wrong person.&rdquo; — Jeff Bezos
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90"
                >
                  Get Started
                  <span aria-hidden>→</span>
                </button>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center rounded-lg border border-white/30 bg-transparent px-5 py-3 text-sm font-medium transition hover:bg-white/10"
                >
                  View Architecture
                </Link>
              </div>
            </div>
            <div className="flex-shrink-0">
              <RobotIllustration />
            </div>
          </div>
        </section>

        {/* Everything You Need */}
        <section id="features" className="border-t border-white/5 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">Everything You Need to Hire at Scale</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-400">
              A complete platform that handles every stage of hiring with AI precision and human oversight when you need it.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-white/10 bg-landing-card/80 p-6 text-left backdrop-blur-sm transition hover:border-white/20"
                >
                  <div className="mb-4">
                    <FeatureIcon name={f.icon} />
                  </div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="border-t border-white/5 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">How It Works</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-400">
              Three simple steps to transform your hiring process.
            </p>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.num} className="relative rounded-2xl border border-white/10 bg-landing-card/60 p-6 text-left">
                  <span className="text-6xl font-bold text-violet-500/20">{s.num}</span>
                  <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/5 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-landing-card to-violet-950/40 p-8 text-center shadow-xl shadow-violet-500/10 sm:p-12">
              <h2 className="text-2xl font-bold sm:text-3xl">Ready to Transform Your Hiring?</h2>
              <p className="mt-3 text-slate-400">
                Join companies that are hiring smarter and faster with AI-driven assessments.
              </p>
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 px-6 py-3 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
              >
                Get Started Now
                <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 px-4 py-8 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
            <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white">
              <LogoIcon className="h-6 w-6" />
              <span className="font-medium">HireMind AI</span>
            </Link>
            <p className="text-sm text-slate-500">© 2026 HireMind AI. All rights reserved.</p>
          </div>
        </footer>
      </main>

      {/* Auth Modal */}
      {authOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setAuthOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-landing-bg p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="auth-modal-title" className="mb-2 text-center text-2xl font-semibold">Sign in to HireMind AI</h2>
            <p className="mb-6 text-center text-sm text-slate-400">
              Admins, companies, and candidates use a single sign-in.
            </p>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-violet-500/50 focus:ring-2"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none ring-violet-500/50 focus:ring-2"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
            <p className="mt-4 text-center text-xs text-slate-500">
              Or <Link href="/login" className="text-violet-400 hover:underline">open the full login page</Link>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
