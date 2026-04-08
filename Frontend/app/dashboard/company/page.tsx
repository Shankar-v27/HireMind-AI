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
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white">{company?.name ?? "Company"} Dashboard</h1>
          <p className="mt-2 text-lg text-zinc-400">Manage your interviews, candidates, and hiring pipeline.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        <div className="mb-12 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-white/20 bg-black p-8 transitional hover:border-white/30">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-zinc-400 font-medium">Total Candidates</p>
                <p className="mt-3 text-4xl font-bold text-white">{candidates.length}</p>
              </div>
              <span className="text-3xl">👥</span>
            </div>
          </div>
          
          <div className="rounded-xl border border-white/20 bg-black p-8 transitional hover:border-white/30">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-zinc-400 font-medium">Total Interviews</p>
                <p className="mt-3 text-4xl font-bold text-white">{interviews.length}</p>
              </div>
              <span className="text-3xl">📋</span>
            </div>
          </div>
          
          <div className="rounded-xl border border-white/20 bg-black p-8 transitional hover:border-white/30">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-zinc-400 font-medium">Active Interviews</p>
                <p className="mt-3 text-4xl font-bold text-white">{activeCount}</p>
              </div>
              <span className="text-3xl">⚡</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
          <Link
            href="/dashboard/company/interviews"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black hover:bg-zinc-200 transition"
          >
            + New Interview
          </Link>
        </div>

        {/* Round 0 Section */}
        <section className="rounded-2xl border border-white/20 bg-black p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Round 0 - Resume Shortlisting</h2>
            <p className="mt-2 text-zinc-400">
              Upload a job title, JD, and bulk resumes. The system evaluates and returns shortlisted candidates.
            </p>
          </div>

          <form onSubmit={handleRound0Shortlist} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Job Title</label>
                <input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Frontend Developer"
                  className="w-full rounded-lg border border-white/20 bg-black px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Job Description</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={4}
                placeholder="React, Node.js, MongoDB, REST APIs..."
                className="w-full rounded-lg border border-white/20 bg-black px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Upload Resumes (PDF or DOCX)</label>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setResumeFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-black hover:file:bg-zinc-200"
              />
              {resumeFiles.length > 0 && (
                <p className="mt-2 text-xs text-zinc-400">{resumeFiles.length} file(s) selected</p>
              )}
            </div>

            {shortlistError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                {shortlistError}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={shortlistLoading}
                className="rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {shortlistLoading ? "Running Round 0..." : "Run Round 0 Shortlisting"}
              </button>

              {shortlistResult && shortlistResult.shortlisted.length > 0 && (
                <button
                  type="button"
                  onClick={downloadShortlistedCsv}
                  className="rounded-lg border border-white/30 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/5 transition"
                >
                  Download Shortlisted CSV
                </button>
              )}
            </div>
          </form>

          {shortlistResult && (
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-white/20 bg-black p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  ✓ Shortlisted ({shortlistResult.shortlisted.length})
                </h3>
                <div className="space-y-3">
                  {shortlistResult.shortlisted.length === 0 && (
                    <p className="text-sm text-zinc-400">No shortlisted candidates.</p>
                  )}
                  {shortlistResult.shortlisted.map((item) => (
                    <div key={item.candidateId} className="rounded-lg border border-white/10 bg-black/50 p-4">
                      <p className="font-medium text-white">{item.name || item.candidateId}</p>
                      <p className="mt-1 text-xs text-zinc-400">{item.mobileNumber || "No mobile number"}</p>
                      <p className="mt-2 text-xs text-zinc-300">{item.evaluation.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/20 bg-black p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  ✗ Rejected ({shortlistResult.rejected.length})
                </h3>
                <div className="space-y-3">
                  {shortlistResult.rejected.length === 0 && (
                    <p className="text-sm text-zinc-400">No rejected candidates.</p>
                  )}
                  {shortlistResult.rejected.map((item) => (
                    <div key={item.candidateId} className="rounded-lg border border-white/10 bg-black/50 p-4">
                      <p className="font-medium text-white">{item.name || item.candidateId}</p>
                      <p className="mt-1 text-xs text-zinc-400">{item.mobileNumber || "No mobile number"}</p>
                      <p className="mt-2 text-xs text-zinc-300">{item.evaluation.reason}</p>
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
