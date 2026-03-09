"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { companyApi, getApiErrorMessage, getToken } from "@/lib/api";

type LiveStartResponse = {
  session_id: number;
  room_name: string;
  meeting_url: string;
  candidate_name?: string | null;
  candidate_email?: string | null;
  jitsi_domain: string;
  jitsi_jwt?: string | null;
};

type ChatMessage =
  | { role: "user"; content: string; requestType?: "verify" | "questions" }
  | {
      role: "assistant";
      content: string;
      evaluation?: string;
      evaluation_rating?: string;
      suggested_questions?: string[];
      tip?: string;
    };

function buildMeetingSrc(meetingUrl: string, token?: string | null) {
  if (!token) return meetingUrl;
  return `${meetingUrl}${meetingUrl.includes("?") ? "&" : "?"}jwt=${encodeURIComponent(token)}`;
}

const RATING_COLORS: Record<string, string> = {
  correct: "bg-emerald-600/90 text-white",
  partial: "bg-amber-600/90 text-white",
  incorrect: "bg-red-600/90 text-white",
  neutral: "bg-slate-600/90 text-white",
};

export default function CompanyLiveInterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const interviewId = Number(params.id);
  const roundId = Number(params.roundId);
  const candidateId = Number(searchParams.get("candidateId"));

  const [meeting, setMeeting] = useState<LiveStartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScoreForm, setShowScoreForm] = useState(false);
  const [score, setScore] = useState("0");
  const [maxScore, setMaxScore] = useState("100");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [chatOpen, setChatOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [assistInput, setAssistInput] = useState("");
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!interviewId || !roundId || !candidateId || !getToken()) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    companyApi.startLiveInterview(interviewId, roundId, candidateId)
      .then((res) => setMeeting(res.data))
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to start live interview")))
      .finally(() => setLoading(false));
  }, [candidateId, interviewId, roundId, router]);

  const meetingSrc = useMemo(
    () => (meeting?.meeting_url ? buildMeetingSrc(meeting.meeting_url, meeting.jitsi_jwt) : ""),
    [meeting]
  );

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateId) return;
    setSubmitting(true);
    setError(null);
    try {
      await companyApi.scoreLiveInterview(interviewId, roundId, {
        candidate_id: candidateId,
        score: Number(score) || 0,
        max_score: Number(maxScore) || 100,
        notes: notes.trim() || undefined,
      });
      router.push(`/dashboard/company/interviews/${interviewId}`);
    } catch (e: any) {
      setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to save score"));
    } finally {
      setSubmitting(false);
    }
  };

  const previousNotes = useMemo(
    () =>
      chatMessages
        .filter((m): m is ChatMessage & { role: "user" } => m.role === "user")
        .map((m) => m.content),
    [chatMessages]
  );

  const handleVerifyAnswer = async () => {
    const note = assistInput.trim();
    if (!note) return;
    setAssistError(null);
    setAssistLoading(true);
    setChatMessages((prev) => [...prev, { role: "user", content: note, requestType: "verify" }]);
    setAssistInput("");
    try {
      const res = await companyApi.liveAssist(interviewId, roundId, {
        note,
        previous_notes: previousNotes,
      });
      const data = res.data as {
        evaluation?: string;
        evaluation_rating?: string;
        suggested_questions?: string[];
        tip?: string;
      };
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.evaluation ?? "",
          evaluation: data.evaluation,
          evaluation_rating: data.evaluation_rating,
          suggested_questions: data.suggested_questions ?? [],
          tip: data.tip,
        },
      ]);
    } catch (e: unknown) {
      const errMsg = getApiErrorMessage((e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail, "AI assist failed.");
      setAssistError(errMsg);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: errMsg },
      ]);
    } finally {
      setAssistLoading(false);
    }
  };

  const handleGetNewQuestions = async () => {
    setAssistError(null);
    setAssistLoading(true);
    const note = "Suggest 3 new questions I can ask the candidate next (follow-ups or new topics). Return varied, relevant questions.";
    setChatMessages((prev) => [...prev, { role: "user", content: "Get new questions", requestType: "questions" }]);
    try {
      const res = await companyApi.liveAssist(interviewId, roundId, {
        note,
        previous_notes: previousNotes,
      });
      const data = res.data as {
        evaluation?: string;
        evaluation_rating?: string;
        suggested_questions?: string[];
        tip?: string;
      };
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.evaluation ?? "Here are suggested questions.",
          evaluation: data.evaluation,
          evaluation_rating: data.evaluation_rating,
          suggested_questions: data.suggested_questions ?? [],
          tip: data.tip,
        },
      ]);
    } catch (e: unknown) {
      const errMsg = getApiErrorMessage((e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail, "Failed to get questions.");
      setAssistError(errMsg);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: errMsg },
      ]);
    } finally {
      setAssistLoading(false);
    }
  };

  if (loading) return <div className="p-4 text-slate-400">Starting live interview...</div>;

  return (
    <main className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href={`/dashboard/company/interviews/${interviewId}`} className="text-sky-400 hover:underline">
            ← Back to interview
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white">Live Interview</h1>
          {meeting && (
            <p className="text-sm text-slate-400">
              Candidate: {meeting.candidate_name || "Unnamed Candidate"} {meeting.candidate_email ? `(${meeting.candidate_email})` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowScoreForm((v) => !v)}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          {showScoreForm ? "Hide Scoring" : "End Meeting & Score"}
        </button>
      </div>

      {error && <p className="rounded bg-red-950/40 px-3 py-2 text-sm text-red-400">{error}</p>}

      {meeting && (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="mb-3 text-sm text-slate-400">
              Room: <span className="text-white">{meeting.room_name}</span>
            </p>
            <iframe
              src={meetingSrc}
              title="Live interview meeting"
              allow="camera; microphone; fullscreen; display-capture"
              className="h-[72vh] w-full rounded-lg border border-slate-800 bg-slate-900"
            />
          </div>

          {/* Interview assistant chatbot */}
          <div
            className={`flex shrink-0 flex-col border border-slate-800 bg-slate-950/80 rounded-xl overflow-hidden ${chatOpen ? "w-full max-w-md" : "w-12"}`}
          >
            <button
              type="button"
              onClick={() => setChatOpen((o) => !o)}
              className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2.5 text-left text-sm font-medium text-white"
            >
              <span className={chatOpen ? "" : "hidden"}>Interview assistant</span>
              <span className="text-slate-400">{chatOpen ? "−" : "💬"}</span>
            </button>
            {chatOpen && (
              <>
                <p className="px-3 py-2 text-xs text-slate-500 border-b border-slate-800">
                  Verify candidate answers or get new questions. Paste their answer and click Verify, or click Get new questions.
                </p>
                <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[50vh] space-y-3 p-3">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-slate-500">Send a candidate answer to verify (correct/partial/incorrect) or ask for new questions.</p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-violet-600/80 text-white"
                            : "bg-slate-800 text-slate-200 border border-slate-700"
                        }`}
                      >
                        {msg.role === "user" && <p className="whitespace-pre-wrap">{msg.content}</p>}
                        {msg.role === "assistant" && (
                          <>
                            {msg.evaluation_rating && (
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-xs font-medium mb-2 ${
                                  RATING_COLORS[msg.evaluation_rating] ?? RATING_COLORS.neutral
                                }`}
                              >
                                {msg.evaluation_rating}
                              </span>
                            )}
                            {msg.evaluation && <p className="whitespace-pre-wrap">{msg.evaluation}</p>}
                            {msg.suggested_questions && msg.suggested_questions.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-slate-400 mb-1">Suggested questions</p>
                                <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-300">
                                  {msg.suggested_questions.map((q, j) => (
                                    <li key={j}>{q}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {msg.tip && (
                              <p className="mt-2 text-xs text-cyan-400/90 border-t border-slate-700 pt-2">Tip: {msg.tip}</p>
                            )}
                            {!msg.evaluation && !msg.suggested_questions?.length && !msg.tip && (
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {assistLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-400">Thinking…</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                {assistError && <p className="px-3 py-1 text-xs text-red-400">{assistError}</p>}
                <div className="border-t border-slate-800 p-3 space-y-2">
                  <textarea
                    value={assistInput}
                    onChange={(e) => setAssistInput(e.target.value)}
                    placeholder="Paste candidate's answer or a note..."
                    rows={2}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    disabled={assistLoading}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleVerifyAnswer}
                      disabled={assistLoading || !assistInput.trim()}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Verify answer
                    </button>
                    <button
                      type="button"
                      onClick={handleGetNewQuestions}
                      disabled={assistLoading}
                      className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                    >
                      Get new questions
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showScoreForm && (
        <form onSubmit={handleSubmitScore} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
          <h2 className="text-lg font-medium text-white">Finalize Interview Score</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-300">
              Score
              <input
                type="number"
                min={0}
                step="0.01"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm text-slate-300">
              Max Score
              <input
                type="number"
                min={1}
                step="0.01"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
            </label>
          </div>
          <label className="block text-sm text-slate-300">
            Interview Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              placeholder="Add evaluation notes, strengths, concerns, and recommendation..."
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Score & Finish"}
          </button>
        </form>
      )}
    </main>
  );
}
