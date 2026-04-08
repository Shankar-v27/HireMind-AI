"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { companyApi, getApiErrorMessage, getToken } from "@/lib/api";

type Company = { id: number; name: string; contact_email: string | null };
type Interview = {
  id: number; name: string; description?: string; company_id: number;
  status: string; follow_order?: boolean; shortlist_count?: number;
  scheduled_start?: string; scheduled_end?: string; created_at: string;
};

export default function CompanyInterviewsListPage() {
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [roundsCount, setRoundsCount] = useState<Record<number, number>>({});
  const [enrolledCount, setEnrolledCount] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newInterview, setNewInterview] = useState({
    name: "",
    description: "",
    follow_order: true,
    shortlist_count: "" as number | "",
    scheduled_start: "",
    scheduled_end: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showCreateInterview, setShowCreateInterview] = useState(false);

  const load = () => {
    const t = getToken();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    Promise.all([companyApi.me(), companyApi.listInterviews()])
      .then(([me, ints]) => {
        setCompany(me.data);
        setInterviews(ints.data ?? []);
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

  useEffect(() => {
    interviews.forEach((i) => {
      companyApi.listRounds(i.id).then((r) => setRoundsCount((prev) => ({ ...prev, [i.id]: (r.data?.length ?? 0) }))).catch(() => {});
      companyApi.listEnrolledCandidates(i.id).then((r) => setEnrolledCount((prev) => ({ ...prev, [i.id]: (r.data?.length ?? 0) }))).catch(() => {});
    });
  }, [interviews]);

  const handleCreateInterview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInterview.name.trim()) return;
    setError(null);
    setSubmitting(true);
    const payload: Parameters<typeof companyApi.createInterview>[0] = {
      name: newInterview.name.trim(),
      description: newInterview.description.trim() || undefined,
      follow_order: newInterview.follow_order,
      shortlist_count: newInterview.shortlist_count === "" ? undefined : Number(newInterview.shortlist_count),
      scheduled_start: newInterview.scheduled_start || undefined,
      scheduled_end: newInterview.scheduled_end || undefined,
    };
    companyApi
      .createInterview(payload)
      .then(() => {
        setNewInterview({
          name: "",
          description: "",
          follow_order: true,
          shortlist_count: "",
          scheduled_start: "",
          scheduled_end: "",
        });
        setShowCreateInterview(false);
        return companyApi.listInterviews();
      })
      .then((r) => {
        setInterviews(r.data);
        setError(null);
      })
      .catch((e) => {
        if (e?.response?.status === 401) {
          window.location.href = "/login";
          return;
        }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed"));
      })
      .finally(() => setSubmitting(false));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-4xl font-bold text-white">Interviews</h1>
            <p className="mt-2 text-lg text-zinc-400">Create and manage your hiring interviews.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateInterview(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 sm:w-auto"
          >
            + New Interview
          </button>
        </div>

        {error && (
          <div className="mb-8 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Interviews Table */}
        <div className="overflow-hidden rounded-xl border border-white/20">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/20 bg-black">
                <th className="px-6 py-4 font-semibold text-white">Interview Name</th>
                <th className="px-6 py-4 font-semibold text-white">Status</th>
                <th className="px-6 py-4 font-semibold text-white">Rounds</th>
                <th className="px-6 py-4 font-semibold text-white">Candidates</th>
                <th className="px-6 py-4 font-semibold text-white">Created</th>
                <th className="px-6 py-4 font-semibold text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {interviews.map((i) => (
                <tr
                  key={i.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/dashboard/company/interviews/${i.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/dashboard/company/interviews/${i.id}`);
                    }
                  }}
                  className="cursor-pointer hover:bg-white/5 transition focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-inset"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium text-white">{i.name}</p>
                    {i.description && <p className="text-xs text-zinc-400 mt-1">{i.description}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        i.status === "active" || i.status === "in_progress"
                          ? "bg-white text-black"
                          : i.status === "completed"
                            ? "bg-zinc-700 text-white"
                            : i.status === "terminated"
                              ? "bg-red-900/30 text-red-300"
                              : "bg-zinc-800 text-zinc-300"
                      }`}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-300">{roundsCount[i.id] ?? "—"}</td>
                  <td className="px-6 py-4 text-zinc-300">{enrolledCount[i.id] ?? "—"}</td>
                  <td className="px-6 py-4 text-zinc-400">
                    {i.created_at ? new Date(i.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/company/interviews/${i.id}`}
                      className="text-white hover:text-zinc-300 font-medium transition"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {interviews.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-zinc-400">No interviews yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Interview Modal */}
      {showCreateInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !submitting && setShowCreateInterview(false)}>
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-black p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-white">Create Interview</h2>
            <p className="mt-2 text-zinc-400">Set up a new interview. You can add rounds and candidates after creation.</p>
            
            <form onSubmit={handleCreateInterview} className="mt-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Interview Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Software Engineer Hiring 2026"
                  value={newInterview.name}
                  onChange={(e) => setNewInterview((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-white/20 bg-black px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Description (optional)</label>
                <textarea
                  placeholder="Brief description of this interview..."
                  rows={3}
                  value={newInterview.description}
                  onChange={(e) => setNewInterview((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded-lg border border-white/20 bg-black px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-white">Sequential Round Order</label>
                    <p className="text-xs text-zinc-400 mt-1">Candidates must complete rounds in order.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newInterview.follow_order}
                    onClick={() => setNewInterview((p) => ({ ...p, follow_order: !p.follow_order }))}
                    className={`relative h-7 w-12 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 ${
                      newInterview.follow_order ? "bg-white" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-black shadow transition-all ${
                        newInterview.follow_order ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Overall Shortlist Count (optional)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 10"
                  value={newInterview.shortlist_count === "" ? "" : newInterview.shortlist_count}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewInterview((p) => ({ ...p, shortlist_count: v === "" ? "" : parseInt(v, 10) || "" }));
                  }}
                  className="w-full rounded-lg border border-white/20 bg-black px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
                />
                <p className="text-xs text-zinc-400 mt-1">Top N candidates based on weighted overall score across all rounds.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Schedule (optional)</label>
                <p className="text-xs text-zinc-400 mb-3">Set a time window when candidates can access this interview.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1.5">Start Date/Time</label>
                    <div className="relative">
                      <input
                        type="datetime-local"
                        value={newInterview.scheduled_start}
                        onChange={(e) => setNewInterview((p) => ({ ...p, scheduled_start: e.target.value }))}
                        className="dark-native w-full rounded-lg border border-white/20 bg-black px-4 py-2.5 pr-10 text-white outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
                      />
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/70"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M8 2v3M16 2v3" />
                        <path d="M3 9h18" />
                        <path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1.5">End Date/Time</label>
                    <div className="relative">
                      <input
                        type="datetime-local"
                        value={newInterview.scheduled_end}
                        onChange={(e) => setNewInterview((p) => ({ ...p, scheduled_end: e.target.value }))}
                        className="dark-native w-full rounded-lg border border-white/20 bg-black px-4 py-2.5 pr-10 text-white outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
                      />
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/70"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M8 2v3M16 2v3" />
                        <path d="M3 9h18" />
                        <path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => !submitting && setShowCreateInterview(false)}
                  className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {submitting ? "Creating…" : "Create Interview"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
