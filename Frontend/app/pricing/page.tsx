import Link from "next/link";
import { PricingSection } from "@/components/ui/pricing";

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

const PRICING_PLANS = [
  {
    name: 'Placement Suite',
    info: 'Ideal for colleges and organizations conducting placement drives without AI interviews.',
    price: {
      monthly: 1999,
      yearly: Math.round(1999 * 12 * (1 - 0.20)),
    },
    features: [
      { text: 'Aptitude & Technical Tests' },
      { text: 'Coding Round (with test cases & evaluation)' },
      { text: 'Basic Proctoring (tab switch detection)' },
      { text: 'Candidate Management Dashboard' },
      { text: 'Bulk Candidate Upload (CSV/Excel)' },
      { text: 'Interview scheduling & tracking' },
    ],
    btn: {
      text: 'Subscribe',
      href: '/login',
    },
  },
  {
    highlighted: true,
    name: 'AI Recruitment',
    info: 'Best for companies looking to fully automate their hiring pipeline using AI.',
    price: {
      monthly: 4999,
      yearly: Math.round(4999 * 12 * (1 - 0.20)),
    },
    features: [
      { text: 'AI Voice Technical Interviews (ITS & STT)' },
      { text: 'AI HR Interviews with automated scoring' },
      { text: 'Advanced Proctoring (face & voice monitoring)' },
      { text: 'Multi-round Interview Automation' },
      { text: 'Resume-based Question Generation' },
      { text: 'Real-time Candidate Scoring & Ranking' },
      { text: 'Detailed Performance Analytics' },
    ],
    btn: {
      text: 'Subscribe',
      href: '/login',
    },
  },
  {
    name: 'Enterprise AI + DevOps',
    info: 'Full-scale hiring automation with enterprise-grade features and integrations.',
    price: {
      monthly: 9999,
      yearly: Math.round(9999 * 12 * (1 - 0.20)),
    },
    features: [
      { text: 'Everything in AI Recruitment' },
      { text: 'AI Interview Copilot (real-time HR assistance)' },
      { text: 'Real-time Interview Evaluation (live sessions)' },
      { text: 'DevOps Automation for hiring workflows' },
      { text: 'Custom API Integrations' },
      { text: 'White-label Branding' },
      { text: 'Dedicated Support & SLA' },
    ],
    btn: {
      text: 'Subscribe',
      href: '/login',
    },
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <LogoIcon className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight">HireMind AI</span>
          </Link>
          <Link href="/" className="text-sm text-zinc-400 hover:text-white transition">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="pt-20">
        <section className="px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold sm:text-5xl">Hire Smarter. Pay Only for What You Need.</h1>
              <p className="mt-4 text-lg text-zinc-400">
                Choose the plan that scales with your hiring goals — from placement drives to full-stack enterprise AI recruitment.
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6">
          <PricingSection
            plans={PRICING_PLANS}
            heading="Choose Your Plan"
            description=""
            className="bg-transparent text-white"
          />
        </section>

        <section className="border-t border-white/10 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold">Have Custom Requirements?</h2>
            <p className="mt-3 text-zinc-500">
              Our sales team can help you build a custom plan tailored to your specific hiring needs and scale.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-zinc-200"
            >
              Contact Sales
              <span aria-hidden>→</span>
            </Link>
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
