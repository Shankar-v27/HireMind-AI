"use client";

import Link from "next/link";
import { SplineScene } from "@/components/ui/splite";

export function SplineSceneBasic() {
  return (
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
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
          >
            Get Started
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-lg border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
          >
            Pricing Plan
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
  );
}
