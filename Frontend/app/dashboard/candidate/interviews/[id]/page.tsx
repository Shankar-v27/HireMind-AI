"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { candidateApi, getApiErrorMessage, getToken } from "@/lib/api";

type Interview = { id: number; name: string; company_id: number; status: string; created_at: string };
type Round = {
  id: number;
  interview_id: number;
  type: string;
  order: number;
  status: string;
  duration_minutes?: number;
  weightage?: number;
};

const ROUND_TYPE_LABELS: Record<string, string> = {
  APT_QUANT: "Technical Aptitude",
  APT_VERBAL: "Aptitude (Verbal)",
  TECH_INTERVIEW: "Technical Interview",
  HR_INTERVIEW: "HR / General Interview",
  LIVE_INTERVIEW: "Live Human Interview",
  CODING: "Coding Round",
  GD: "Group Discussion",
};

function roundLabel(type: string): string {
  return ROUND_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

export default function CandidateInterviewDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [sessionByRound, setSessionByRound] = useState<Record<number, { status: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !getToken()) {
      window.location.href = "/login";
      return;
    }
    Promise.all([
      candidateApi.listInterviews().then((r) => {
        const iv = (r.data as Interview[]).find((i) => i.id === id);
        if (iv) setInterview(iv);
      }),
      candidateApi.listRounds(id).then((r) => setRounds(r.data || [])),
      candidateApi.getVerification().then((r) => setVerificationStatus(r.data?.status ?? null)),
    ])
      .catch((e) => {
        if (e?.response?.status === 401) { window.location.href = "/login"; return; }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load"));
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    rounds.forEach((r) => {
      candidateApi.getRoundSession(r.id)
        .then((s) => {
          if (s.data) setSessionByRound((prev) => ({ ...prev, [r.id]: { status: s.data!.status } }));
        })
        .catch(() => {});
    });
  }, [rounds]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  const verified = verificationStatus === "approved";
  const statusColor =
    interview?.status === "active" || interview?.status === "in_progress"
      ? "text-emerald-400"
      : interview?.status === "completed"
        ? "text-violet-400"
        : "text-slate-400";

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-sm font-medium ${statusColor}`}>
            {interview?.status ?? "—"}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-white">{interview?.name ?? `Interview`}</h1>

        {error && (
          <p className="mt-4 rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        {!verified && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-800/60 bg-amber-950/30 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡</span>
              <div>
                <p className="font-semibold text-amber-200">Verification Required</p>
                <p className="text-sm text-amber-200/80">Complete identity verification to access interview rounds.</p>
              </div>
            </div>
            <Link
              href="/dashboard/candidate/verification"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
            >
              <span>🛡</span> Verify Now
            </Link>
          </div>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white">Interview Rounds</h2>
          <p className="mt-1 text-sm text-slate-400">Complete the available rounds at your own pace.</p>
          <ul className="mt-4 space-y-3">
            {rounds
              .sort((a, b) => a.order - b.order)
              .map((r) => {
                const session = sessionByRound[r.id];
                const completed = session?.status === "submitted" || session?.status === "completed";
                const locked = !verified;
                const label = roundLabel(r.type);
                const details: string[] = [];
                if (r.duration_minutes) details.push(`${r.duration_minutes} min`);
                if (r.weightage != null) details.push(`Weight ${r.weightage}%`);
                return (
                  <li key={r.id}>
                    <Link
                      href={locked ? "#" : `/dashboard/candidate/interviews/${id}/rounds/${r.id}`}
                      className={`flex items-center gap-4 rounded-xl border p-4 transition ${
                        locked
                          ? "cursor-not-allowed border-slate-800 bg-slate-900/50 opacity-80"
                          : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/80"
                      }`}
                      onClick={(e) => locked && e.preventDefault()}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600/80 text-sm font-semibold text-white">
                        {r.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">{label}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                          {details.length > 0 && <span className="text-slate-400">{details.join(" · ")}</span>}
                          <span
                            className={
                              completed ? "text-violet-400" : locked ? "text-slate-500" : "text-sky-400"
                            }
                          >
                            {completed ? "Completed" : locked ? "Locked" : "Available"}
                          </span>
                          {r.type === "LIVE_INTERVIEW" && !locked && (
                            <span className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-xs text-emerald-400">
                              Live
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-slate-500">
                        {locked ? "🔒" : completed ? "✓" : "→"}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      </div>
    </div>
  );
}
