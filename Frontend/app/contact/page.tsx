import Link from "next/link";
import { ContactForm } from "@/components/ui/contact-form";

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

export default function ContactPage() {
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
          <div className="mx-auto max-w-2xl">
            <div className="mb-8">
              <h1 className="text-4xl font-bold sm:text-5xl">Contact Sales</h1>
              <p className="mt-3 text-lg text-zinc-400">
                Have questions about our pricing or need a custom plan? Our sales team is here to help.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-8 backdrop-blur-sm">
              <ContactForm />
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 p-6">
                <h3 className="text-lg font-semibold">Email</h3>
                <p className="mt-2 text-zinc-400">
                  <a href="mailto:sales@hiremind.ai" className="text-white hover:text-zinc-300">
                    sales@hiremind.ai
                  </a>
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 p-6">
                <h3 className="text-lg font-semibold">Response Time</h3>
                <p className="mt-2 text-zinc-400">
                  We typically respond within 24 hours.
                </p>
              </div>
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
