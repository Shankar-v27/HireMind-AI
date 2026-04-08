"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { candidateApi, getApiErrorMessage, getToken } from "@/lib/api";

type Verification = {
  id: number;
  candidate_id: number;
  status: string;
  id_proof_url: string | null;
  photo_url: string | null;
  resume_url: string | null;
} | null;

export default function CandidateDashboard() {
  const [profile, setProfile] = useState<{ id: number; email: string; full_name: string | null; company_id: number } | null>(null);
  const [interviews, setInterviews] = useState<{ id: number; name: string; company_id: number; status: string; created_at: string }[]>([]);
  const [verification, setVerification] = useState<Verification>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    Promise.all([candidateApi.me(), candidateApi.listInterviews(), candidateApi.getVerification()])
      .then(([me, ints, ver]) => {
        setProfile(me.data);
        setInterviews(ints.data || []);
        setVerification(ver.data ?? null);
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
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-white/70">Loading…</p>
      </div>
    );
  }

  const name = profile?.full_name || profile?.email?.split("@")[0] || "there";
  const verified = verification?.status === "approved";
  const count = interviews.length;

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-white">Welcome, {name}</h1>
        <p className="mt-1 text-white/70">
          {verified ? "You're verified. Check your interviews to get started." : "Complete verification to access your interview rounds."}
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-white/20 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Verification Status</h2>
            <div className="mt-4 flex items-center gap-3">
              {verified ? (
                <>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">✓</span>
                  <span className="text-lg font-medium text-white">Verified</span>
                </>
              ) : (
                <>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">!</span>
                  <span className="text-white/80">Complete verification to access rounds</span>
                </>
              )}
            </div>
            {!verified && (
              <Link
                href="/dashboard/candidate/verification"
                className="mt-4 inline-block text-sm font-medium text-white hover:text-white/80 transition"
              >
                Complete verification →
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-white/20 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Enrolled Interviews</h2>
            <div className="mt-4">
              <p className="text-3xl font-bold text-white">{count}</p>
            </div>
            <Link
              href="/dashboard/candidate/interviews"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-white hover:text-white/80 transition"
            >
              View Interviews
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
