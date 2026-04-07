import { useState } from "react";
import emailjs, { EmailJSResponseStatus } from "@emailjs/browser";

// ─────────────────────────────────────────────────────────────────────────────
// EMAILJS CONFIG
// ─────────────────────────────────────────────────────────────────────────────
// Uses EmailJS to send email from the browser.
// Configure these in Frontend/.env.local:
//   VITE_EMAILJS_PUBLIC_KEY=...
//   VITE_EMAILJS_SERVICE_ID=...
//   VITE_EMAILJS_TEMPLATE_ID=...
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";

const SUPPORT_EMAIL = "shankarvelmurugan2018@gmail.com";

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE PLACEHOLDER
// ─────────────────────────────────────────────────────────────────────────────
function handlePayment(planName, billingType) {
  console.log(`Initiating payment for: ${planName} (${billingType})`);
  alert(`Redirecting to checkout for ${planName}…`);
  // TODO: Call backend API /create-checkout-session
  // const res = await fetch("/api/payment/create-session", {
  //   method: "POST",
  //   body: JSON.stringify({ plan: planName, billing: billingType }),
  // });
  // const { url } = await res.json();
  // window.location.href = url;  // Redirect to Stripe
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING DATA
// ─────────────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: "Placement Suite",
    icon: "🎓",
    monthly: 1999,
    yearly: 19999,
    description:
      "Ideal for colleges and organizations conducting placement drives without AI interviews.",
    features: [
      { label: "Aptitude & Technical Tests", included: true },
      { label: "Coding Round (with test cases & evaluation)", included: true },
      { label: "Basic Proctoring (tab switch detection)", included: true },
      { label: "Candidate Management Dashboard", included: true },
      { label: "Bulk Candidate Upload (CSV/Excel)", included: true },
      { label: "AI Voice Interviews", included: false },
    ],
    cta: "Subscribe",
    popular: false,
  },
  {
    name: "AI Recruitment",
    icon: "🤖",
    monthly: 4999,
    yearly: 49999,
    description:
      "Best for companies looking to fully automate their hiring pipeline using AI.",
    features: [
      { label: "AI Voice Technical Interviews (TTS & STT)", included: true },
      { label: "AI HR Interviews with automated scoring", included: true },
      { label: "Advanced Proctoring (face & voice monitoring)", included: true },
      { label: "Multi-round Interview Automation", included: true },
      { label: "Resume-based Question Generation", included: true },
      { label: "Real-time Candidate Scoring & Ranking", included: true },
      { label: "Detailed Performance Analytics", included: true },
    ],
    cta: "Subscribe",
    popular: true,
  },
  {
    name: "Enterprise AI + DevOps",
    icon: "🚀",
    monthly: 9999,
    yearly: 99999,
    description:
      "Full-scale hiring automation with enterprise-grade features and integrations.",
    features: [
      { label: "Everything in AI Recruitment", included: true },
      { label: "AI Interview Copilot (real-time HR assistance)", included: true },
      { label: "Real-time Interview Evaluation (live sessions)", included: true },
      { label: "DevOps Automation for hiring workflows", included: true },
      { label: "Custom API Integrations", included: true },
      { label: "White-label Branding", included: true },
      { label: "Dedicated Support & SLA", included: true },
    ],
    cta: "Subscribe",
    popular: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function formatINR(num) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO + TOGGLE
// ─────────────────────────────────────────────────────────────────────────────
function Hero({ billing, setBilling }) {
  return (
    <div className="text-center pt-20 pb-12 px-6">
      <div className="inline-flex items-center gap-2 border border-white/20 rounded-full px-4 py-1.5 text-white/60 text-xs font-medium mb-6 tracking-wide">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse inline-block" />
        AI-Powered Hiring Platform
      </div>

      <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 leading-tight">
        Hire Smarter. Pay Only for What You Need.
      </h1>
      <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10">
        Choose the plan that scales with your hiring goals — from placement drives
        to full-stack enterprise AI recruitment.
      </p>

      <div className="inline-flex items-center gap-1 border border-white/15 rounded-xl p-1.5">
        <button
          onClick={() => setBilling("monthly")}
          className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            billing === "monthly" ? "bg-white text-black" : "text-white/50 hover:text-white"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBilling("yearly")}
          className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
            billing === "yearly" ? "bg-white text-black" : "text-white/50 hover:text-white"
          }`}
        >
          Yearly
          <span className="bg-white/10 text-white border border-white/20 rounded-full px-2 py-0.5 text-xs font-bold">
            Save 20%
          </span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING CARDS
// ─────────────────────────────────────────────────────────────────────────────
function PricingCards({ billing }) {
  return (
    <section id="pricing" className="max-w-6xl mx-auto px-6 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {PLANS.map((plan) => {
          const price = billing === "monthly" ? plan.monthly : plan.yearly;
          const billingLabel = billing === "monthly" ? "/month" : "/year";

          return (
            <div
              key={plan.name}
              className="relative flex flex-col rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 group bg-black border border-white/15 text-white hover:border-white/35"
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-black text-white text-xs font-bold px-4 py-1.5 rounded-full border border-white/20 tracking-wide uppercase">
                    ⚡ Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <div className="text-3xl mb-3">{plan.icon}</div>
                <h3 className="text-xl font-bold mb-1 text-white">{plan.name}</h3>
                <p className="text-sm leading-relaxed text-white/50">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-extrabold text-white">{formatINR(price)}</span>
                <span className="text-sm ml-1 text-white/40">{billingLabel}</span>
                {billing === "yearly" && (
                  <p className="text-xs mt-1 font-medium text-white/50">
                    🎉 {formatINR(Math.round(plan.monthly * 12 - plan.yearly))} saved vs monthly
                  </p>
                )}
              </div>

              <div className="my-4 border-t border-white/10" />

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-3 text-sm">
                    <span
                      className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        f.included ? "bg-white text-black" : "bg-white/5 text-white/20"
                      }`}
                    >
                      {f.included ? "✓" : "✕"}
                    </span>
                    <span className={f.included ? "text-white/90" : "text-white/25 line-through"}>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePayment(plan.name, billing)}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] bg-white text-black hover:bg-white/90"
              >
                {plan.cta}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT
// ─────────────────────────────────────────────────────────────────────────────
function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | success | error
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) {
      setStatus("error");
      setErrorMessage(
        "Email is not configured yet. Set VITE_EMAILJS_PUBLIC_KEY, VITE_EMAILJS_SERVICE_ID, and VITE_EMAILJS_TEMPLATE_ID in Frontend/.env.local."
      );
      return;
    }

    try {
      const templateParams = {
        // Preferred keys (match typical EmailJS templates):
        title: "HireMind AI — Pricing Contact",
        name: form.name,
        email: form.email,
        message: form.message,

        // Common EmailJS keys (kept for compatibility):
        from_name: form.name,
        reply_to: form.email,
        to_email: SUPPORT_EMAIL,
        subject: `HireMind AI — Message from ${form.name}`,
      };

      const response = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, {
        publicKey: EMAILJS_PUBLIC_KEY,
      });

      if (response?.status === 200) {
        setStatus("success");
        setForm({ name: "", email: "", message: "" });
      } else {
        setStatus("error");
        setErrorMessage(
          `Message failed to send (EmailJS status: ${response?.status ?? "unknown"}). Please try again or email us directly.`
        );
      }
    } catch (err) {
      if (err instanceof EmailJSResponseStatus) {
        setStatus("error");
        setErrorMessage(`EmailJS error: ${err.text || err.message || "Unknown error"}`);
        return;
      }

      setStatus("error");
      setErrorMessage("Message failed to send. Please try again or email us directly.");
    }
  }

  return (
    <section id="contact" className="max-w-5xl mx-auto px-6 pb-24">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 md:p-12">
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <div className="inline-flex items-center gap-2 border border-white/15 rounded-full px-4 py-1.5 text-white/60 text-xs font-medium mb-6">
              ✉️ Talk to Us
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Have Questions?</h2>
            <p className="text-white/50 mb-8 leading-relaxed">
              Our team is here to help you find the right plan for your hiring needs. Reach out and we&apos;ll get back
              to you within 24 hours.
            </p>
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <span className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-lg flex-shrink-0">
                  📧
                </span>
                <div>
                  <div className="text-xs text-white/30 mb-0.5">Email</div>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-white hover:text-white/70 transition-colors font-medium text-sm"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-lg flex-shrink-0">
                  📞
                </span>
                <div>
                  <div className="text-xs text-white/30 mb-0.5">Phone</div>
                  <a
                    href="tel:+91XXXXXXXXXX"
                    className="text-white hover:text-white/70 transition-colors font-medium text-sm"
                  >
                    +91-9659716602
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-lg flex-shrink-0">
                  🕐
                </span>
                <div>
                  <div className="text-xs text-white/30 mb-0.5">Response Time</div>
                  <span className="text-white font-medium text-sm">Within 24 hours</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            {status === "success" ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="text-xl font-bold text-white mb-2">Message Sent!</h3>
                <p className="text-white/50">We&apos;ll get back to you within 24 hours.</p>
                <button
                  onClick={() => setStatus("idle")}
                  className="mt-6 text-sm text-white/60 hover:text-white underline underline-offset-4 transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2">Your Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Rahul Sharma"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={status === "sending"}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-all disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="rahul@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={status === "sending"}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-all disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2">Message</label>
                  <textarea
                    required
                    rows={5}
                    placeholder="Tell us about your hiring needs..."
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    disabled={status === "sending"}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-all resize-none disabled:opacity-50"
                  />
                </div>

                {status === "error" && (
                  <p className="text-red-400 text-xs">
                    {errorMessage || "Something went wrong. Please try again or email us directly."}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full bg-white text-black font-semibold py-3 rounded-xl text-sm transition-all duration-200 hover:bg-white/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {status === "sending" ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin inline-block" />
                      Sending…
                    </>
                  ) : (
                    "Send Message →"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PricingPage() {
  const [billing, setBilling] = useState("monthly");

  return (
    <div className="min-h-screen bg-black text-white antialiased">
      <Hero billing={billing} setBilling={setBilling} />
      <PricingCards billing={billing} />
      <Contact />
    </div>
  );
}
