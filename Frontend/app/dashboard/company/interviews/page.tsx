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
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Interviews</h1>
            <p className="mt-1 text-sm text-slate-400">Create and manage your hiring interviews.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateInterview(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            + New Interview
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="px-4 py-3 font-medium text-slate-300">Name</th>
                <th className="px-4 py-3 font-medium text-slate-300">Status</th>
                <th className="px-4 py-3 font-medium text-slate-300">Rounds</th>
                <th className="px-4 py-3 font-medium text-slate-300">Candidates</th>
                <th className="px-4 py-3 font-medium text-slate-300">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
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
                  className="cursor-pointer border-b border-slate-800/80 hover:bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-500/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{i.name}</p>
                    {i.description && <p className="text-xs text-slate-500">{i.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        i.status === "active" || i.status === "in_progress"
                          ? "bg-emerald-900/50 text-emerald-400"
                          : i.status === "completed"
                            ? "bg-violet-900/50 text-violet-400"
                            : i.status === "terminated"
                              ? "bg-red-900/50 text-red-400"
                              : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{roundsCount[i.id] ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{enrolledCount[i.id] ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {i.created_at ? new Date(i.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/company/interviews/${i.id}`}
                      className="text-violet-400 hover:text-violet-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {interviews.length === 0 && (
            <p className="px-4 py-8 text-center text-slate-500">No interviews yet. Create one to get started.</p>
          )}
        </div>
      </div>

      {showCreateInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !submitting && setShowCreateInterview(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-landing-card/95 p-8 shadow-2xl backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-white">Create Interview</h2>
            <p className="mt-1 text-sm text-slate-400">Set up a new interview. You can add rounds and candidates after creation.</p>
            <form onSubmit={handleCreateInterview} className="mt-6 space-y-5">
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
                <h3 className="mb-4 text-sm font-medium text-slate-300">Interview Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Interview Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Software Engineer Hiring 2026"
                      value={newInterview.name}
                      onChange={(e) => setNewInterview((p) => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none ring-violet-500/50 focus:ring-2"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Description (optional)</label>
                    <textarea
                      placeholder="Brief description of this interview..."
                      rows={3}
                      value={newInterview.description}
                      onChange={(e) => setNewInterview((p) => ({ ...p, description: e.target.value }))}
                      className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none ring-violet-500/50 focus:ring-2"
                    />
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Sequential Round Order</label>
                      <p className="mt-0.5 text-xs text-slate-500">Candidates must complete rounds in order.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={newInterview.follow_order}
                      onClick={() => setNewInterview((p) => ({ ...p, follow_order: !p.follow_order }))}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/60 ${
                        newInterview.follow_order ? "bg-violet-600" : "bg-slate-600"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                          newInterview.follow_order ? "left-7" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Overall Shortlist Count (optional)</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="e.g. 10"
                      value={newInterview.shortlist_count === "" ? "" : newInterview.shortlist_count}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNewInterview((p) => ({ ...p, shortlist_count: v === "" ? "" : parseInt(v, 10) || "" }));
                      }}
                      className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none ring-violet-500/50 focus:ring-2"
                    />
                    <p className="mt-1 text-xs text-slate-500">Top N candidates based on weighted overall score across all rounds.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Schedule (optional)</label>
                    <p className="mb-2 text-xs text-slate-500">Set a time window when candidates can access this interview.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-0.5 block text-xs text-slate-500">Start Date/Time</label>
                        <input
                          type="datetime-local"
                          value={newInterview.scheduled_start}
                          onChange={(e) => setNewInterview((p) => ({ ...p, scheduled_start: e.target.value }))}
                          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-violet-500/50 focus:ring-2"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs text-slate-500">End Date/Time</label>
                        <input
                          type="datetime-local"
                          value={newInterview.scheduled_end}
                          onChange={(e) => setNewInterview((p) => ({ ...p, scheduled_end: e.target.value }))}
                          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-violet-500/50 focus:ring-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => !submitting && setShowCreateInterview(false)}
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-gradient-to-r from-violet-500 to-violet-600 py-2.5 text-sm font-medium text-white shadow-lg hover:opacity-90 disabled:opacity-50"
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
