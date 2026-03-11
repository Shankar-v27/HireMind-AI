"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { companyApi, getApiErrorMessage, getToken } from "@/lib/api";

type Question = {
  id: number; round_id: number; content: string; type: string;
  difficulty: string | null; domain: string | null;
  options?: Record<string, string> | null;
  correct_answer?: string | null;
  max_score?: number;
  approved?: boolean;
  test_cases?: { public?: object[]; hidden?: object[] } | null;
  extra_metadata?: { model_answer?: string } | null;
};
type Round = {
  id: number; interview_id: number; type: string; order: number;
  status: string; weightage?: number; duration_minutes?: number;
  config?: { recruiter_requirements?: string; resume_summary?: string };
};

type AddMode = "ai" | "manual" | "file";

export default function CompanyRoundQuestionsPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const roundId = Number(params.roundId);
  const [round, setRound] = useState<Round | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("text");
  const [newCorrectAnswer, setNewCorrectAnswer] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState("");
  const [aiDomain, setAiDomain] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recruiterReqs, setRecruiterReqs] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  const loadRoundAndQuestions = () => {
    if (!id || !roundId || !getToken()) { router.replace("/login"); return; }
    setError(null);
    Promise.all([
      companyApi.getRound(roundId).then((r) => setRound(r.data)),
      companyApi.listRoundQuestions(roundId).then((r) => setQuestions(r.data)),
    ])
      .catch((e) => {
        if (e?.response?.status === 401) { window.location.href = "/login"; return; }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load"));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRoundAndQuestions(); }, [id, roundId]);

  useEffect(() => {
    if (round?.config?.recruiter_requirements != null) setRecruiterReqs(round.config.recruiter_requirements || "");
  }, [round?.config?.recruiter_requirements]);

  const isTechRound = round?.type === "TECH_INTERVIEW";
  const isHRRound = round?.type === "HR_INTERVIEW";
  const isVoiceOnlyRound = isTechRound || isHRRound;

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setSubmitting(true);
    companyApi
      .addQuestion(roundId, {
        content: newContent.trim(),
        type: newType,
        correct_answer: newCorrectAnswer || undefined,
      })
      .then(() => { loadRoundAndQuestions(); setNewContent(""); setNewCorrectAnswer(""); })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to add")))
      .finally(() => setSubmitting(false));
  };

  const handleGenerateAi = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    companyApi
      .generateQuestions(roundId, { count: aiCount, difficulty: aiDifficulty || undefined, domain: aiDomain || undefined })
      .then(() => loadRoundAndQuestions())
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "AI generation failed")))
      .finally(() => setSubmitting(false));
  };

  const handleBulkUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) return;
    setSubmitting(true);
    companyApi
      .bulkAddQuestions(roundId, bulkFile)
      .then((r) => { setBulkFile(null); loadRoundAndQuestions(); if (r.data.failed > 0) setError(`Created ${r.data.created}, failed ${r.data.failed}`); })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Upload failed")))
      .finally(() => setSubmitting(false));
  };

  const handleApprove = (qId: number, approved: boolean) => {
    companyApi.approveQuestion(qId, approved)
      .then(() => loadRoundAndQuestions())
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed")));
  };

  const handleDelete = (qId: number) => {
    if (!confirm("Delete this question and all its responses?")) return;
    companyApi.deleteQuestion(qId)
      .then(() => loadRoundAndQuestions())
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Delete failed")));
  };

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;

  const approvedCount = questions.filter((q) => q.approved !== false).length;
  const unapprovedCount = questions.length - approvedCount;

  const formatCaseValue = (value: unknown) => {
    if (value == null || value === "") return "(empty)";
    if (typeof value === "string") return value;
    return String(value);
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center gap-4">
        <Link href={`/dashboard/company/interviews/${id}`} className="text-sky-400 hover:underline">← Back to Interview</Link>
        <div>
          <h1 className="text-2xl font-semibold">{round?.type ?? "Round"} — Order {round?.order ?? roundId}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-400">
            {round?.order != null && <span><strong className="text-slate-300">Order:</strong> {round.order}</span>}
            {round?.weightage != null && <span><strong className="text-slate-300">Weightage:</strong> {round.weightage}%</span>}
            {round?.duration_minutes != null && <span><strong className="text-slate-300">Duration:</strong> {round.duration_minutes} min</span>}
          </div>
        </div>
      </header>
      {error && <p className="rounded bg-red-950/40 px-3 py-2 text-sm text-red-400">{error}</p>}

      {isVoiceOnlyRound ? (
        <section className="space-y-4 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4">
          <h2 className="text-lg font-medium text-amber-200">
            {isHRRound ? "HR Round (AI Voice)" : "Tech Round (AI Voice)"}
          </h2>
          <p className="text-sm text-slate-300">
            Questions are generated on-the-fly by AI during candidate sessions.
          </p>
          {isHRRound && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Recruiter Requirements</label>
              <textarea placeholder="What should the AI evaluate..."
                value={recruiterReqs} onChange={(e) => setRecruiterReqs(e.target.value)}
                onBlur={() => {
                  if (recruiterReqs === (round?.config?.recruiter_requirements || "")) return;
                  setSavingConfig(true);
                  companyApi.updateRoundConfig(roundId, { recruiter_requirements: recruiterReqs })
                    .then(() => loadRoundAndQuestions())
                    .finally(() => setSavingConfig(false));
                }}
                className="min-h-[100px] w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
              {savingConfig && <span className="text-xs text-slate-400">Saving...</span>}
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="mb-3 text-lg font-medium">Add Questions</h2>
            <div className="mb-4 flex gap-2 border-b border-slate-700 pb-2">
              {(["ai", "manual", "file"] as const).map((m) => (
                <button key={m} onClick={() => setAddMode(m)}
                  className={`rounded px-3 py-1.5 text-sm ${addMode === m ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
                  {m === "ai" ? "AI Generated" : m === "manual" ? "Manual" : "Upload File"}
                </button>
              ))}
            </div>

            {addMode === "ai" && (
              <form onSubmit={handleGenerateAi} className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Count
                  <input type="number" min={1} max={50} value={aiCount} onChange={(e) => setAiCount(Number(e.target.value) || 5)}
                    className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1.5" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Difficulty
                  <input placeholder="easy/medium/hard" value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value)}
                    className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1.5" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Domain
                  <input placeholder="e.g. algorithms" value={aiDomain} onChange={(e) => setAiDomain(e.target.value)}
                    className="w-36 rounded border border-slate-700 bg-slate-900 px-2 py-1.5" />
                </label>
                <button type="submit" disabled={submitting}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                  {submitting ? "Generating..." : "Generate with AI"}
                </button>
              </form>
            )}

            {addMode === "manual" && (
              <form onSubmit={handleAddManual} className="space-y-3">
                <div className="flex gap-3">
                  <select value={newType} onChange={(e) => setNewType(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm">
                    <option value="text">Text</option>
                    <option value="mcq">MCQ</option>
                    <option value="coding">Coding</option>
                  </select>
                  <textarea placeholder="Question content" value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="min-h-[80px] flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
                </div>
                <input placeholder="Correct answer (optional)" value={newCorrectAnswer}
                  onChange={(e) => setNewCorrectAnswer(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
                <button type="submit" disabled={submitting}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                  Add Question
                </button>
              </form>
            )}

            {addMode === "file" && (
              <form onSubmit={handleBulkUpload} className="space-y-2">
                <p className="text-xs text-slate-400">CSV/Excel: content, type, difficulty, domain</p>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  className="text-sm text-slate-300" />
                <button type="submit" disabled={submitting || !bulkFile}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                  Upload
                </button>
              </form>
            )}
          </section>
        </>
      )}

      {!isVoiceOnlyRound && (
        <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Questions ({questions.length})</h2>
            {unapprovedCount > 0 && (
              <span className="text-xs text-amber-400">{unapprovedCount} pending approval</span>
            )}
          </div>
          <div className="space-y-2">
            {questions.map((q) => (
              <div key={q.id}
                className={`rounded border px-4 py-3 text-sm ${
                  q.approved === false
                    ? "border-amber-800/50 bg-amber-950/20"
                    : "border-slate-700/50 bg-slate-900/50"
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 cursor-pointer" onClick={() => setExpandedQ(expandedQ === q.id ? null : q.id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{q.type}</span>
                      {q.difficulty && <span className="text-xs text-amber-400">{q.difficulty}</span>}
                      {q.domain && <span className="text-xs text-slate-500">{q.domain}</span>}
                      {q.max_score && <span className="text-xs text-sky-400">{q.max_score} pts</span>}
                      {q.approved === false && <span className="text-xs text-amber-500 font-medium">UNAPPROVED</span>}
                    </div>
                    <p className="text-slate-200">{expandedQ === q.id ? q.content : q.content.slice(0, 150) + (q.content.length > 150 ? "..." : "")}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {q.approved === false ? (
                      <button onClick={() => handleApprove(q.id, true)}
                        className="rounded bg-green-700 px-2 py-1 text-xs text-white hover:bg-green-600">
                        Approve
                      </button>
                    ) : (
                      <button onClick={() => handleApprove(q.id, false)}
                        className="rounded bg-amber-700 px-2 py-1 text-xs text-white hover:bg-amber-600">
                        Reject
                      </button>
                    )}
                    <button onClick={() => handleDelete(q.id)}
                      className="rounded bg-red-700 px-2 py-1 text-xs text-white hover:bg-red-600">
                      Delete
                    </button>
                  </div>
                </div>
                {expandedQ === q.id && (
                  <div className="mt-3 border-t border-slate-700 pt-3 space-y-2 text-xs text-slate-400">
                    {q.correct_answer && <p><strong className="text-slate-300">Answer:</strong> {q.correct_answer}</p>}
                    {q.extra_metadata?.model_answer && (
                      <div>
                        <strong className="text-slate-300">Model Answer:</strong>
                        <pre className="mt-1 overflow-x-auto rounded bg-slate-800 p-3 text-left text-sm text-slate-200 whitespace-pre font-mono">{q.extra_metadata.model_answer}</pre>
                      </div>
                    )}
                    {q.test_cases?.public && (
                      <div>
                        <strong className="text-slate-300">Public Test Cases:</strong>
                        <div className="mt-1 space-y-2">
                          {q.test_cases.public.map((testCase, index) => (
                            <div key={index} className="rounded bg-slate-800 p-2">
                              <p><strong className="text-slate-300">Case {index + 1}</strong></p>
                              <p className="whitespace-pre-wrap"><strong className="text-slate-300">Input:</strong> {formatCaseValue((testCase as { input?: unknown }).input)}</p>
                              <p className="whitespace-pre-wrap"><strong className="text-slate-300">Expected:</strong> {formatCaseValue((testCase as { expected?: unknown }).expected)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {q.test_cases?.hidden && (
                      <div>
                        <strong className="text-slate-300">Hidden Test Cases:</strong>
                        <div className="mt-1 space-y-2">
                          {q.test_cases.hidden.map((testCase, index) => (
                            <div key={index} className="rounded bg-slate-800 p-2">
                              <p><strong className="text-slate-300">Hidden Case {index + 1}</strong></p>
                              <p className="whitespace-pre-wrap"><strong className="text-slate-300">Input:</strong> {formatCaseValue((testCase as { input?: unknown }).input)}</p>
                              <p className="whitespace-pre-wrap"><strong className="text-slate-300">Expected:</strong> {formatCaseValue((testCase as { expected?: unknown }).expected)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {questions.length === 0 && <p className="text-slate-500">No questions yet.</p>}
          </div>
        </section>
      )}
    </main>
  );
}
