import { Link } from "react-router-dom";
import SplineScene from "../components/SplineScene.jsx";

function LogoIcon({ className }) {
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <LogoIcon className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight">HireMind AI</span>
          </Link>
        </div>
      </header>

      <main className="pt-16">
        <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 md:pt-16">
          <div className="relative mx-auto flex max-w-6xl flex-col gap-6">
            <div className="flex min-h-[480px] flex-col gap-10 lg:min-h-[520px] lg:flex-row lg:items-stretch lg:gap-12">
              <div className="relative flex flex-1 flex-col justify-center">
                <blockquote className="max-w-xl">
                  <p className="text-balance text-2xl font-semibold leading-snug tracking-tight text-white sm:text-3xl md:text-4xl md:leading-snug">
                    &ldquo;I&apos;d rather interview 50 people and not hire anyone than hire the wrong person.&rdquo;
                  </p>
                  <footer className="mt-5 text-base font-medium text-zinc-400 md:text-lg">— Jeff Bezos</footer>
                </blockquote>
                <p className="mt-6 max-w-lg text-sm leading-relaxed text-zinc-500 sm:text-base">
                  HireMind AI helps teams hold that line — structured interviews, AI-assisted evaluation, and rankings
                  so you hire for fit, not speed alone.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/pricing"
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
                  >
                    Get Started
                    <span aria-hidden>→</span>
                  </Link>
                  <Link
                    to="/pricing"
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
                  >
                    Pricing Plans
                    <span aria-hidden>→</span>
                  </Link>
                </div>
              </div>

              <div className="relative min-h-[300px] flex-1 bg-black lg:min-h-[520px]">
                <SplineScene
                  scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                  className="h-full min-h-[300px] w-full lg:min-h-[520px]"
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
