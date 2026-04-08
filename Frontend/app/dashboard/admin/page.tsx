"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, getApiErrorMessage, getToken } from "@/lib/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState<{ total_companies: number; total_interviews: number; total_candidates: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    adminApi
      .stats()
      .then((r) => { setStats(r.data); setError(null); })
      .catch((e) => {
        if (e?.response?.status === 401) { window.location.href = "/login"; return; }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load"));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-white/70">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="mt-1 text-white/70">Overview of the entire hiring platform.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-white/20 bg-white/5 p-6">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-white/70">Total Companies</p>
              <span className="rounded-lg bg-white/10 p-2 text-white/70">🏢</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{stats?.total_companies ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/5 p-6">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-white/70">Total Interviews</p>
              <span className="rounded-lg bg-white/10 p-2 text-white/70">📋</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{stats?.total_interviews ?? 0}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/5 p-6">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-white/70">Total Candidates</p>
              <span className="rounded-lg bg-white/10 p-2 text-white/70">👤</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{stats?.total_candidates ?? 0}</p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
          <p className="mt-2 text-sm text-white/70">Use the sidebar to navigate to Companies to add and manage company accounts.</p>
          <Link
            href="/dashboard/admin/companies"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-white/90"
          >
            Manage Companies →
          </Link>
        </section>
      </div>
    </div>
  );
}
