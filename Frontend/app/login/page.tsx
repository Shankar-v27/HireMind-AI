"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, getApiErrorMessage, setToken, setRefreshToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(email, password);
      setToken(res.data.access_token);
      if (res.data.refresh_token) setRefreshToken(res.data.refresh_token);
      const role = res.data.role || (await authApi.me()).data.role;
      if (role === "candidate") sessionStorage.setItem("hiremind_just_logged_in", "1");
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
    <main className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-[#1A182F] to-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-landing-card/90 p-8 shadow-xl shadow-violet-500/10 backdrop-blur-sm">
        <div className="mb-6 flex justify-center">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 text-lg font-bold">H</span>
            <span className="text-xl font-semibold">HireMind AI</span>
          </Link>
        </div>
        <h1 className="mb-2 text-center text-2xl font-semibold">Sign in</h1>
        <p className="mb-6 text-center text-sm text-slate-400">
          Admins, companies, and candidates share a single sign-in.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
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
      </div>
    </main>
  );
}
