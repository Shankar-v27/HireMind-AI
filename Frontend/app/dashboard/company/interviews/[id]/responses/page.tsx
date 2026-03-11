"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { companyApi, getApiErrorMessage, getToken } from "@/lib/api";

type Round = {
  id: number; interview_id: number; type: string; order: number;
  status: string; weightage?: number; duration_minutes?: number;
};
type Interview = {
  id: number; name: string; description?: string; status: string;
  follow_order?: boolean; shortlist_count?: number;
};
type EnrolledCandidate = { id: number; email: string; full_name: string | null; verification_status: string };
type ResponseRow = {
  id: number; candidate_id: number; candidate_email: string;
  candidate_name: string | null; question_id: number;
  content: string | null; score: number | null; effective_score?: number | null;
  warning_count: number;
};
type TopPerformer = {
  candidate_id: number; candidate_email: string; candidate_name: string | null;
  total_weighted_score: number; round_scores: Record<string, number>;
  recommendation_status?: string | null;
};
type PlagiarismSummary = {
  round_id: number;
  total_checks: number;
  flagged_submissions: number;
  checks: { candidate_id: number; candidate_name?: string | null; candidate_email?: string | null; question_id: number; plagiarism?: { warning?: boolean }; cross_plagiarism?: { warning?: boolean } }[];
};

const ROUND_TYPE_LABEL: Record<string, string> = {
  APT_QUANT: "General/Quant Aptitude",
  APT_TECH: "Technical Aptitude",
  APT_MIXED: "Mixed Aptitude",
  CODING: "Coding",
  GD: "Group Discussion",
  TECH_INTERVIEW: "Technical Interview",
  HR_INTERVIEW: "HR/General Interview",
  LIVE_INTERVIEW: "Live Interview",
};

export default function InterviewResponsesPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [interview, setInterview] = useState<Interview | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [enrolled, setEnrolled] = useState<EnrolledCandidate[]>([]);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[] | null>(null);
  const [responsesByRound, setResponsesByRound] = useState<Record<number, ResponseRow[]>>({});
  const [plagiarismByRound, setPlagiarismByRound] = useState<Record<number, PlagiarismSummary | null>>({});
  const [plagiarismLoadingRound, setPlagiarismLoadingRound] = useState<number | null>(null);
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"rounds" | "top">("rounds");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!id || !getToken()) return;
    setLoading(true);
    Promise.all([
      companyApi.listInterviews().then((r) => {
        const iv = (r.data as Interview[]).find((i) => i.id === id);
        if (iv) setInterview(iv);
      }),
      companyApi.listRounds(id).then((r) => {
        const list = r.data ?? [];
        setRounds(list);
        if (list.length > 0 && !expandedRound) setExpandedRound(list[0].id);
      }),
      companyApi.listEnrolledCandidates(id).then((r) => setEnrolled(r.data)),
      companyApi.topPerformers(id).then((r) => setTopPerformers(r.data)).catch(() => setTopPerformers([])),
    ])
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load")))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !getToken()) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [id, router, loadData]);

  const loadRoundResponses = (roundId: number, force = false) => {
    if (!force && responsesByRound[roundId]) return;
    companyApi
      .listResponsesByRound(id, roundId)
      .then((r) => setResponsesByRound((prev) => ({ ...prev, [roundId]: r.data ?? [] })))
      .catch(() => {});
  };

  const handleCheckPlagiarism = (roundId: number) => {
    setPlagiarismLoadingRound(roundId);
    companyApi
      .plagiarismCheck(roundId)
      .then((r) => {
        setPlagiarismByRound((prev) => ({ ...prev, [roundId]: r.data }));
        // Refresh round responses so plagiarism flags/scores are visible immediately.
        loadRoundResponses(roundId, true);
      })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Plagiarism check failed")))
      .finally(() => setPlagiarismLoadingRound(null));
  };

  const handleCreateFromShortlisted = async () => {
    const name = prompt("Name for the new interview from shortlisted candidates:");
    if (!name) return;
    try {
      await companyApi.createFromShortlisted(id, name);
      router.push("/dashboard/company");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: unknown } } };
      setError(getApiErrorMessage(err?.response?.data?.detail, "Failed"));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <main className="space-y-6 p-6 md:p-8">
      <Link href={`/dashboard/company/interviews/${id}`} className="text-sm text-violet-400 hover:text-violet-300">
        ← Back to Interview
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-white md:text-3xl">{interview?.name ?? "Interview"} - Responses</h1>
        <p className="mt-1 text-sm text-slate-300">
          {rounds.length} round{rounds.length !== 1 ? "s" : ""} | {enrolled.length} submission{enrolled.length !== 1 ? "s" : ""}
        </p>
      </header>

      {error && <p className="rounded-lg bg-red-950/40 px-4 py-2 text-sm text-red-400">{error}</p>}

      <div className="flex gap-1 rounded-t-lg border border-b-0 border-slate-700 bg-slate-900/40 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("rounds")}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition ${
            activeTab === "rounds" ? "bg-slate-800/60 text-slate-300" : "text-white hover:opacity-90"
          }`}
        >
          <span aria-hidden>📄</span> Round Responses
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("top")}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition ${
            activeTab === "top" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          <span aria-hidden>🏆</span> Top Performers
        </button>
      </div>

      {activeTab === "rounds" && (
        <div className="space-y-3">
          {rounds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 py-12 text-center text-slate-500">
              No rounds yet. Add rounds in the interview to see responses here.
            </div>
          ) : (
            rounds.map((round) => {
              const isExpanded = expandedRound === round.id;
              const responses = responsesByRound[round.id] ?? [];
              const candidateIds = Array.from(new Set(responses.map((r) => r.candidate_id)));
              const avgScore =
                responses.length > 0
                  ? (responses.reduce((s, r) => s + (r.effective_score ?? r.score ?? 0), 0) / responses.length).toFixed(1)
                  : "0.0";

              return (
                <div key={round.id} className="rounded-xl border border-white/10 bg-landing-card/60 overflow-hidden backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedRound(isExpanded ? null : round.id);
                      if (!isExpanded) loadRoundResponses(round.id);
                    }}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">{isExpanded ? "▼" : "▶"}</span>
                      <span className="font-semibold text-white">
                        Round {round.order}: {ROUND_TYPE_LABEL[round.type] ?? round.type}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${round.status === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-600 text-slate-300"}`}>
                        {round.status}
                      </span>
                    </div>
                    <span className="text-sm text-slate-400">
                      {enrolled.length} candidates | Avg: {responses.length ? avgScore : "—"}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-white/10 bg-slate-900/30 px-5 py-4">
                      <button
                        type="button"
                        onClick={() => handleCheckPlagiarism(round.id)}
                        disabled={plagiarismLoadingRound === round.id}
                        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20"
                      >
                        <span aria-hidden>🛡</span> {plagiarismLoadingRound === round.id ? "Checking..." : "Check Plagiarism & AI"}
                      </button>
                      {plagiarismByRound[round.id] && (
                        <div className="mb-4 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm">
                          <p className="text-slate-300">
                            Checked {plagiarismByRound[round.id]!.total_checks} submissions, flagged {plagiarismByRound[round.id]!.flagged_submissions}.
                          </p>
                        </div>
                      )}
                      <div className="space-y-2">
                        {enrolled.map((c) => {
                          const hasResponse = candidateIds.includes(c.id);
                          return (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-slate-500">▶</span>
                                <span className="text-slate-400">👤</span>
                                <div>
                                  <p className="font-medium text-white">{c.full_name || "—"}</p>
                                  <p className="text-sm text-slate-400">{c.email}</p>
                                </div>
                              </div>
                              <span className={`rounded-full px-2 py-1 text-xs font-medium ${hasResponse ? "bg-amber-500/20 text-amber-300" : "bg-slate-600 text-slate-400"}`}>
                                {hasResponse ? "in_progress" : "pending"}
                              </span>
                            </div>
                          );
                        })}
                        {enrolled.length === 0 && <p className="text-sm text-slate-500">No candidates enrolled.</p>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "top" && (
        <div className="rounded-b-lg border border-t-0 border-slate-700 bg-slate-800/50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>🏆</span>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-white">Overall Rankings</h2>
                {interview?.shortlist_count != null && interview.shortlist_count > 0 && (
                  <span className="inline-flex rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    Shortlisting Top {interview.shortlist_count}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateFromShortlisted}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              <span aria-hidden className="text-emerald-400">+</span> New Interview with Shortlisted
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            Candidates ranked by weighted score across {rounds.length} round{rounds.length !== 1 ? "s" : ""}.
          </p>
          <div className="mt-6 space-y-3">
            {!topPerformers || topPerformers.length === 0 ? (
              <p className="text-sm text-slate-500">No performance data yet. Complete rounds to see rankings.</p>
            ) : (
              topPerformers.map((tp) => {
                const roundsCompleted = Object.keys(tp.round_scores ?? {}).length;
                const roundTypeLabel = rounds.length > 0 ? (ROUND_TYPE_LABEL[rounds[0].type] ?? rounds[0].type) : "—";
                const weightedPct = Math.round(tp.total_weighted_score);
                return (
                  <div
                    key={tp.candidate_id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700/80 bg-slate-900/50 px-4 py-4"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400" aria-hidden>☆</span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-white">{tp.candidate_name || "—"}</p>
                          {(tp.recommendation_status === "recommended" || tp.recommendation_status === "shortlisted") && (
                            <span className="inline-flex rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                              Shortlisted
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300">{tp.candidate_email}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{roundTypeLabel}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end text-right">
                      <p className="text-sm text-slate-300">{roundsCompleted}/{rounds.length} rounds</p>
                      <p className="text-lg font-semibold text-white">{weightedPct}%</p>
                      <p className="text-xs text-slate-400">weighted score</p>
                      <p className="text-xs text-red-400">{weightedPct}% (100%)</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </main>
  );
}
