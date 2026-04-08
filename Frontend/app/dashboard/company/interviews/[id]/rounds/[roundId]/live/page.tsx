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
    // In React dev Strict Mode, effects can run twice. Guard against stale
    // async responses setting error after a successful start.
    let isActive = true;

    setLoading(true);
    setError(null);

    companyApi
      .startLiveInterview(interviewId, roundId, candidateId)
      .then((res) => {
        if (!isActive) return;
        setMeeting(res.data);
        setError(null);
      })
      .catch((e) => {
        if (!isActive) return;
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to start live interview"));
      })
      .finally(() => {
        if (!isActive) return;
        setLoading(false);
      });

    return () => {
      isActive = false;
    };
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

  if (loading) return <div className="p-4 text-white/60">Starting live interview...</div>;

  return (
    <main className="space-y-4 bg-black p-4 text-white">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/dashboard/company/interviews/${interviewId}`}
            className="text-white/70 underline underline-offset-4 hover:text-white"
          >
            ← Back to interview
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-white leading-tight">Live Interview</h1>
          {meeting && (
            <p className="text-sm text-white/60">
              Candidate: {meeting.candidate_name || "Unnamed Candidate"} {meeting.candidate_email ? `(${meeting.candidate_email})` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowScoreForm((v) => !v)}
          className="w-full rounded bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 sm:w-auto"
        >
          {showScoreForm ? "Hide Scoring" : "End Meeting & Score"}
        </button>
      </header>

      {error && !meeting && <p className="rounded bg-red-950/40 px-3 py-2 text-sm text-red-400">{error}</p>}

      {meeting && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/5 p-3">
            <p className="mb-3 text-sm text-white/60">
              Room: <span className="text-white">HireMind Interview Room</span>
            </p>
            <iframe
              src={meetingSrc}
              title="Live interview meeting"
              allow="camera; microphone; fullscreen; display-capture"
              className="h-[72vh] w-full rounded-lg border border-white/20 bg-black"
            />
          </div>

          {/* Interview assistant chatbot */}
          <div
            className={`flex shrink-0 flex-col bg-black border border-white/20 rounded-xl overflow-hidden transition-all duration-200 ${
              chatOpen ? "w-full lg:w-[360px]" : "w-12"
            }`}
          >
            <button
              type="button"
              onClick={() => setChatOpen((o) => !o)}
              className="flex items-center justify-between bg-white/5 border-b border-white/10 px-4 py-3 text-left font-semibold text-white hover:bg-white/10 transition-colors"
            >
              <span className={chatOpen ? "text-base" : "hidden"}>AI Assistant</span>
              <span className="text-lg">{chatOpen ? "−" : "💬"}</span>
            </button>
            {chatOpen && (
              <>
                <p className="px-4 py-3 text-xs text-white/60 border-b border-white/10 bg-white/5">
                  Ask questions to assist with the interview or analyze candidate responses
                </p>
                <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[60vh] space-y-4 p-4 bg-black">
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-white/50 text-center py-8">No messages yet. Start by asking the AI for help.</p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-xs rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white rounded-br-none"
                            : "bg-white/10 text-white border border-white/20 rounded-bl-none"
                        }`}
                      >
                        {msg.role === "user" && <p className="whitespace-pre-wrap">{msg.content}</p>}
                        {msg.role === "assistant" && (
                          <div className="space-y-2">
                            {msg.evaluation_rating && (
                              <span
                                className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                                  RATING_COLORS[msg.evaluation_rating] ?? RATING_COLORS.neutral
                                }`}
                              >
                                {msg.evaluation_rating.charAt(0).toUpperCase() + msg.evaluation_rating.slice(1)}
                              </span>
                            )}
                            {msg.evaluation && <p className="whitespace-pre-wrap text-white/90">{msg.evaluation}</p>}
                            {msg.suggested_questions && msg.suggested_questions.length > 0 && (
                              <div className="mt-3 pt-2 border-t border-white/10">
                                <p className="text-xs font-semibold text-white/70 mb-2">Suggested Questions:</p>
                                <ul className="space-y-1">
                                  {msg.suggested_questions.map((q, j) => (
                                    <li key={j} className="text-xs text-white/70 flex items-start gap-2">
                                      <span className="text-white/50 mt-0.5">•</span>
                                      <span>{q}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {msg.tip && (
                              <p className="mt-2 text-xs bg-blue-600/20 border border-blue-500/30 rounded px-2 py-1.5 text-blue-200">
                                💡 {msg.tip}
                              </p>
                            )}
                            {!msg.evaluation && !msg.suggested_questions?.length && !msg.tip && (
                              <p className="whitespace-pre-wrap text-white/90">{msg.content}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {assistLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/10 border border-white/20 rounded-xl rounded-bl-none px-4 py-3">
                        <div className="flex gap-2">
                          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                {assistError && <p className="px-4 py-2 text-xs text-red-400 bg-red-950/20 border-t border-red-900/50">{assistError}</p>}
                <div className="border-t border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="flex gap-2">
                    <textarea
                      value={assistInput}
                      onChange={(e) => setAssistInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleVerifyAnswer();
                        }
                      }}
                      placeholder="Type your question or paste a candidate's response..."
                      rows={2}
                      className="flex-1 rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder-white/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white/15 transition-colors resize-none"
                      disabled={assistLoading}
                    />
                    <button
                      type="button"
                      onClick={handleVerifyAnswer}
                      disabled={assistLoading || !assistInput.trim()}
                      className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center self-end"
                    >
                      {assistLoading ? "..." : "Send"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showScoreForm && (
        <form onSubmit={handleSubmitScore} className="rounded-xl border border-white/20 bg-white/5 p-4 space-y-4">
          <h2 className="text-lg font-medium text-white">Finalize Interview Score</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-white/80">
              Score
              <input
                type="number"
                min={0}
                step="0.01"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="mt-1 w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm text-white/80">
              Max Score
              <input
                type="number"
                min={1}
                step="0.01"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="mt-1 w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-white"
              />
            </label>
          </div>
          <label className="block text-sm text-white/80">
            Interview Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-white"
              placeholder="Add evaluation notes, strengths, concerns, and recommendation..."
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Score & Finish"}
          </button>
        </form>
      )}
    </main>
  );
}
