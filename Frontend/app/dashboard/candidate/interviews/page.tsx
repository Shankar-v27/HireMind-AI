"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { candidateApi, getApiErrorMessage, getToken } from "@/lib/api";

type Interview = { id: number; name: string; description?: string; company_id: number; status: string; created_at: string };
type Round = { id: number; interview_id: number; type: string; order: number; status: string };

export default function CandidateInterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [roundsByInterview, setRoundsByInterview] = useState<Record<number, Round[]>>({});
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    candidateApi.listInterviews()
      .then((r) => { setInterviews(r.data || []); setError(null); })
      .catch((e) => {
        if (e?.response?.status === 401) { window.location.href = "/login"; return; }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load"));
      })
      .finally(() => setLoading(false));

    candidateApi.getVerification()
      .then((r) => setVerificationStatus(r.data?.status ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    interviews.forEach((i) => {
      candidateApi.listRounds(i.id)
        .then((r) => setRoundsByInterview((prev) => ({ ...prev, [i.id]: r.data || [] })))
        .catch(() => {});
    });
  }, [interviews]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-white/70">Loading…</p>
      </div>
    );
  }

  const verified = verificationStatus === "approved";

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-white">My Interviews</h1>
        <p className="mt-1 text-white/70">View your enrolled interviews and access rounds.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="mt-6">
          {interviews.length === 0 ? (
            <p className="rounded-xl border border-white/30 bg-white/5 p-8 text-center text-white/60">
              No interviews enrolled yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {interviews.map((i) => {
                const rounds = roundsByInterview[i.id] || [];
                const roundCount = rounds.length;
                const isActive = i.status === "active" || i.status === "in_progress";
                return (
                  <li key={i.id}>
                    <Link
                      href={`/dashboard/candidate/interviews/${i.id}`}
                      className="flex items-center justify-between gap-4 rounded-xl border border-white/20 bg-white/5 p-5 transition hover:border-white/30 hover:bg-white/10"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-white">{i.name}</p>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                isActive ? "bg-white/20 text-white" : i.status === "completed" ? "bg-white/10 text-white/80" : "bg-white/10 text-white/70"
                              }`}
                            >
                              {i.status}
                            </span>
                          </div>
                          {i.description && (
                            <p className="mt-1 text-sm text-white/70">{i.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-white/70">
                              {roundCount} round{roundCount !== 1 ? "s" : ""}
                            </span>
                            {!verified && (
                              <span className="inline-flex items-center gap-1.5 text-white/60">
                                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/60 text-[10px] font-medium">O</span>
                                Verification needed
                              </span>
                            )}
                            {verified && (
                              <span className="inline-flex items-center gap-1.5 text-white">Verified</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-white/60" aria-hidden>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
