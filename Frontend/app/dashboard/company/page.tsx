"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { companyApi, getApiErrorMessage, getToken } from "@/lib/api";

type Company = { id: number; name: string; contact_email: string | null };
type Interview = {
  id: number; name: string; description?: string; company_id: number;
  status: string; follow_order?: boolean; shortlist_count?: number;
  scheduled_start?: string; scheduled_end?: string; created_at: string;
};
type Candidate = { id: number; email: string; full_name: string | null; company_id: number; created_at: string };

export default function CompanyDashboard() {
  const [company, setCompany] = useState<Company | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    const t = getToken();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    Promise.all([companyApi.me(), companyApi.listInterviews(), companyApi.listCandidates()])
      .then(([me, ints, cands]) => {
        setCompany(me.data);
        setInterviews(ints.data ?? []);
        setCandidates(cands.data ?? []);
        setError(null);
      })
      .catch((e) => {
        if (e?.response?.status === 401) {
          window.location.href = "/login";
          return;
        }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load"));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const activeCount = interviews.filter((i) => i.status === "active" || i.status === "in_progress").length;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-white">{company?.name ?? "Company"} Dashboard</h1>
        <p className="mt-1 text-slate-400">Manage your interviews, candidates, and hiring pipeline.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-slate-400">Total Candidates</p>
              <span className="rounded-lg bg-sky-500/10 p-2 text-sky-400">👥</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{candidates.length}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-slate-400">Total Interviews</p>
              <span className="rounded-lg bg-violet-500/10 p-2 text-violet-400">📋</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{interviews.length}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-slate-400">Active Interviews</p>
              <span className="rounded-lg bg-amber-500/10 p-2 text-amber-400">⚡</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{activeCount}</p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/dashboard/company/interviews"
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >
              + New Interview
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
