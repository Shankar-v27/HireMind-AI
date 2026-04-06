"use client";

import { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { companyApi, getApiErrorMessage, getToken, shortlistApi } from "@/lib/api";

type Company = { id: number; name: string; contact_email: string | null };
type Interview = {
  id: number; name: string; description?: string; company_id: number;
  status: string; follow_order?: boolean; shortlist_count?: number;
  scheduled_start?: string; scheduled_end?: string; created_at: string;
};
type Candidate = { id: number; email: string; full_name: string | null; company_id: number; created_at: string };
type ShortlistItem = {
  candidateId: string;
  name?: string;
  mobileNumber?: string;
  resumeUrl: string;
  evaluation: {
    overall_score: number;
    decision: string;
    reason: string;
  };
};

export default function CompanyDashboard() {
  const [company, setCompany] = useState<Company | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [shortlistResult, setShortlistResult] = useState<{ shortlisted: ShortlistItem[]; rejected: ShortlistItem[] } | null>(null);
  const [latestJobId, setLatestJobId] = useState<string | null>(null);
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

  async function downloadShortlistedCsv() {
    if (!latestJobId) return;
    try {
      const res = await shortlistApi.downloadShortlistedCsv(latestJobId);
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shortlisted_${latestJobId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { message?: string; detail?: unknown } }; message?: string };
      setShortlistError(
        (typeof axErr?.response?.data?.message === "string" && axErr.response.data.message) ||
          getApiErrorMessage(axErr?.response?.data?.detail, axErr?.message || "CSV download failed.")
      );
    }
  }

  async function handleRound0Shortlist(e: FormEvent) {
    e.preventDefault();
    setShortlistError(null);
    setShortlistResult(null);

    const cleanTitle = jobTitle.trim();
    const cleanDescription = jobDescription.trim();

    if (!cleanTitle || !cleanDescription) {
      setShortlistError("Job title and job description are required.");
      return;
    }

    if (!resumeFiles.length) {
      setShortlistError("Please upload at least one resume (PDF or DOCX).");
      return;
    }

    setShortlistLoading(true);
    try {
      const jobRes = await shortlistApi.createJob({
        title: cleanTitle,
        description: cleanDescription,
      });
      const jobId = jobRes.data?.data?.id;
      if (!jobId) {
        throw new Error("Failed to create job.");
      }
      setLatestJobId(jobId);

      const uploadRes = await shortlistApi.uploadResumes(resumeFiles);
      const candidateIds = (uploadRes.data?.data ?? []).map((c) => c.id).filter(Boolean);
      const resultRes = await shortlistApi.shortlistCandidates(jobId, candidateIds);

      setShortlistResult({
        shortlisted: resultRes.data?.shortlisted ?? [],
        rejected: resultRes.data?.rejected ?? [],
      });
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { message?: string; detail?: unknown } }; message?: string };
      setShortlistError(
        (typeof axErr?.response?.data?.message === "string" && axErr.response.data.message) ||
          getApiErrorMessage(axErr?.response?.data?.detail, axErr?.message || "Round 0 shortlisting failed.")
      );
    } finally {
      setShortlistLoading(false);
    }
  }

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

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Round 0 - Resume Shortlisting</h2>
          <p className="mt-1 text-sm text-slate-400">
            Upload a job title, JD, and bulk resumes. The system evaluates and returns shortlisted candidates.
          </p>

          <form onSubmit={handleRound0Shortlist} className="mt-5 space-y-4">
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Job Title</label>
              <input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Frontend Developer"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-violet-500/30 focus:ring-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-slate-300">Job Description</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={5}
                placeholder="React, Node.js, MongoDB, REST APIs..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-violet-500/30 focus:ring-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-slate-300">Resumes (bulk upload)</label>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setResumeFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-500"
              />
              {resumeFiles.length > 0 && (
                <p className="text-xs text-slate-400">{resumeFiles.length} files selected</p>
              )}
            </div>

            {shortlistError && <p className="text-sm text-red-300">{shortlistError}</p>}

            <button
              type="submit"
              disabled={shortlistLoading}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {shortlistLoading ? "Running Round 0..." : "Run Round 0 Shortlisting"}
            </button>

            {shortlistResult && shortlistResult.shortlisted.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={downloadShortlistedCsv}
                  className="ml-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
                >
                  Download Shortlisted CSV
                </button>
              </>
            )}
          </form>

          {shortlistResult && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                  Shortlisted ({shortlistResult.shortlisted.length})
                </h3>
                <div className="mt-3 space-y-3">
                  {shortlistResult.shortlisted.length === 0 && <p className="text-sm text-slate-400">No shortlisted candidates.</p>}
                  {shortlistResult.shortlisted.map((item) => (
                    <div key={item.candidateId} className="rounded-md border border-emerald-800/50 bg-black/30 p-3">
                      <p className="text-sm font-medium text-white">{item.name || item.candidateId}</p>
                      <p className="text-xs text-slate-400">{item.mobileNumber || "No mobile parsed"}</p>
                      <p className="mt-1 text-xs text-slate-300">{item.evaluation.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-300">
                  Rejected ({shortlistResult.rejected.length})
                </h3>
                <div className="mt-3 space-y-3">
                  {shortlistResult.rejected.length === 0 && <p className="text-sm text-slate-400">No rejected candidates.</p>}
                  {shortlistResult.rejected.map((item) => (
                    <div key={item.candidateId} className="rounded-md border border-rose-800/50 bg-black/30 p-3">
                      <p className="text-sm font-medium text-white">{item.name || item.candidateId}</p>
                      <p className="text-xs text-slate-400">{item.mobileNumber || "No mobile parsed"}</p>
                      <p className="mt-1 text-xs text-slate-300">{item.evaluation.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
