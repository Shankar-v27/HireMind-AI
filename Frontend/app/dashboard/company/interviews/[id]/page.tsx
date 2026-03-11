"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import { companyApi, getApiErrorMessage, getToken } from "@/lib/api";

type Round = {
  id: number; interview_id: number; type: string; order: number;
  status: string; weightage?: number; duration_minutes?: number;
};
type Interview = {
  id: number; name: string; description?: string; status: string;
  follow_order?: boolean; shortlist_count?: number;
  scheduled_start?: string; scheduled_end?: string;
};
type EnrolledCandidate = { id: number; email: string; full_name: string | null; verification_status: string };
type ResponseRow = {
  id: number; candidate_id: number; candidate_email: string;
  candidate_name: string | null; question_id: number;
  question_content: string; question_type?: string | null;
  content: string | null; score: number | null; effective_score?: number | null;
  warning_count: number;
  plagiarism_warning: boolean;
  plagiarism?: Record<string, unknown> | null;
  cross_plagiarism?: Record<string, unknown> | null;
  created_at: string;
};
type CandidateRoundSummary = {
  round_id: number;
  round_type: string;
  round_order: number;
  status: string;
  score?: number | null;
  max_score?: number | null;
  normalized_score?: number | null;
  weighted_score?: number | null;
  weightage: number;
  notes?: string | null;
};
type CandidateResponseDetail = {
  response_id: number;
  round_id?: number | null;
  round_type?: string | null;
  question_id: number;
  question_content: string;
  question_type: string;
  candidate_answer?: string | null;
  selected_option?: string | null;
  selected_option_text?: string | null;
  correct_answer?: string | null;
  correct_option_text?: string | null;
  is_correct?: boolean | null;
  score?: number | null;
  effective_score?: number | null;
  max_score?: number | null;
  grading_method?: string | null;
  grading_details?: Record<string, unknown> | null;
  plagiarism_warning?: boolean;
  plagiarism?: Record<string, unknown> | null;
  cross_plagiarism?: Record<string, unknown> | null;
  created_at: string;
};
type VerificationData = {
  id: number;
  candidate_id: number;
  id_proof_url: string | null;
  photo_url: string | null;
  resume_url: string | null;
  status: string;
  ocr_data?: { resume_text?: string; face_match?: { confidence?: number; match?: boolean } } | null;
  created_at: string;
  updated_at: string;
};
type CandidateSummary = {
  candidate_id: number;
  candidate_email: string;
  candidate_name?: string | null;
  verification_status?: string | null;
  overall_rank?: number | null;
  total_candidates: number;
  total_weighted_score: number;
  recommendation_status: string;
  suitability_comment: string;
  score_breakdown: Record<string, number>;
  total_warnings: number;
  report: string;
  rounds: CandidateRoundSummary[];
  responses: CandidateResponseDetail[];
  verification?: VerificationData | null;
  proctoring_events: { type: string; created_at: string; data?: Record<string, unknown> }[];
};

export default function CompanyInterviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [interview, setInterview] = useState<Interview | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [enrolled, setEnrolled] = useState<EnrolledCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newRound, setNewRound] = useState({
    type: "APT_QUANT",
    order: 0,
    weightage: 0,
    duration_minutes: 30,
    num_questions: 20,
    difficulty: "Medium",
    domains: "",
  });
  const [enrollIds, setEnrollIds] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [passwordCol, setPasswordCol] = useState(2);
  const [responsesByRound, setResponsesByRound] = useState<Record<number, ResponseRow[]>>({});
  const [viewRoundId, setViewRoundId] = useState<number | null>(null);

  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [addCandidateForm, setAddCandidateForm] = useState({ full_name: "", email: "", password: "" });
  const [addCandidateError, setAddCandidateError] = useState<string | null>(null);
  const [addCandidateSubmitting, setAddCandidateSubmitting] = useState(false);
  const [livePickerOpen, setLivePickerOpen] = useState(false);
  const [livePickerRoundId, setLivePickerRoundId] = useState<number | null>(null);
  const [livePickerSubmitting, setLivePickerSubmitting] = useState<number | null>(null);
  const [livePickerError, setLivePickerError] = useState<string | null>(null);
  const [candidateSummary, setCandidateSummary] = useState<CandidateSummary | null>(null);
  const [candidateSummaryOpen, setCandidateSummaryOpen] = useState(false);
  const [candidateSummaryLoading, setCandidateSummaryLoading] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"rounds" | "candidates" | "analytics">("rounds");
  const [addRoundOpen, setAddRoundOpen] = useState(false);
  const [editInterviewOpen, setEditInterviewOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", follow_order: true, shortlist_count: "" as number | "", scheduled_start: "", scheduled_end: "" });

  const loadData = useCallback(() => {
    if (!id || !getToken()) return;
    setLoading(true);
    Promise.all([
      companyApi.listInterviews().then((r) => {
        const iv = (r.data as Interview[]).find((i) => i.id === id);
        if (iv) setInterview(iv);
      }),
      companyApi.listRounds(id).then((r) => {
        setRounds(r.data);
        setNewRound((prev) => ({ ...prev, order: (r.data?.length ?? 0) + 1, weightage: 0, duration_minutes: 30, num_questions: 20, difficulty: "Medium", domains: "" }));
      }),
      companyApi.listEnrolledCandidates(id).then((r) => setEnrolled(r.data)),
    ])
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed")))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !getToken()) { router.replace("/login"); return; }
    loadData();
  }, [id, router, loadData]);

  useEffect(() => {
    if (interview) {
      setEditForm({
        name: interview.name,
        description: interview.description ?? "",
        follow_order: interview.follow_order !== false,
        shortlist_count: interview.shortlist_count ?? "",
        scheduled_start: interview.scheduled_start ? interview.scheduled_start.slice(0, 16) : "",
        scheduled_end: interview.scheduled_end ? interview.scheduled_end.slice(0, 16) : "",
      });
    }
  }, [interview]);

  const handleStatusChange = async (action: "activate" | "end" | "terminate") => {
    setSubmitting(true);
    setError(null);
    try {
      if (action === "activate") await companyApi.activateInterview(id);
      else if (action === "end") await companyApi.endInterview(id);
      else await companyApi.terminateInterview(id);
      loadData();
    } catch (e: any) {
      setError(getApiErrorMessage(e?.response?.data?.detail, `Failed to ${action}`));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddRound = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const domainsList = newRound.domains.split(",").map((s) => s.trim()).filter(Boolean);
    companyApi
      .addRound(id, {
        type: newRound.type,
        order: newRound.order,
        weightage: newRound.weightage,
        duration_minutes: newRound.duration_minutes,
        config: {
          num_questions: newRound.num_questions,
          difficulty: newRound.difficulty,
          domains: domainsList.length ? domainsList : undefined,
        },
      })
      .then(() => companyApi.listRounds(id))
      .then((r) => {
        setRounds(r.data);
        setAddRoundOpen(false);
        setNewRound((prev) => ({ ...prev, order: (r.data?.length ?? 0) + 1, domains: "", weightage: 0 }));
      })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed")))
      .finally(() => setSubmitting(false));
  };

  const handleEditInterview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.name.trim()) return;
    setSubmitting(true);
    companyApi
      .updateInterview(id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        follow_order: editForm.follow_order,
        shortlist_count: editForm.shortlist_count === "" ? undefined : Number(editForm.shortlist_count),
        scheduled_start: editForm.scheduled_start || undefined,
        scheduled_end: editForm.scheduled_end || undefined,
      })
      .then(() => companyApi.listInterviews())
      .then((r) => {
        const iv = (r.data as Interview[]).find((i) => i.id === id);
        if (iv) setInterview(iv);
        setEditInterviewOpen(false);
      })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Update failed")))
      .finally(() => setSubmitting(false));
  };

  const ROUND_TYPE_LABEL: Record<string, string> = {
    APT_QUANT: "Aptitude (Quant)",
    APT_TECH: "Technical Aptitude",
    APT_MIXED: "Mixed Aptitude",
    CODING: "Coding",
    GD: "Group Discussion",
    TECH_INTERVIEW: "Technical Interview",
    HR_INTERVIEW: "HR/General Interview",
    LIVE_INTERVIEW: "Live Interview",
  };

  const handleDeleteRound = async (roundId: number) => {
    if (!confirm("Delete this round and all its questions/responses?")) return;
    setSubmitting(true);
    try {
      await companyApi.deleteRound(roundId);
      loadData();
    } catch (e: any) {
      setError(getApiErrorMessage(e?.response?.data?.detail, "Delete failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    const ids = enrollIds.split(/[\s,]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (!ids.length) return;
    setSubmitting(true);
    companyApi
      .enrollCandidates(id, ids)
      .then(() => { setEnrollIds(""); loadData(); })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed")))
      .finally(() => setSubmitting(false));
  };

  const handleBulkEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) return;
    setSubmitting(true);
    companyApi
      .bulkEnrollCandidates(id, bulkFile, passwordCol)
      .then(() => { setBulkFile(null); loadData(); })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Failed")))
      .finally(() => setSubmitting(false));
  };

  const handleAddCandidateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { full_name, email, password } = addCandidateForm;
    if (!email.trim() || !password.trim()) { setAddCandidateError("Email and password are required."); return; }
    setAddCandidateError(null);
    setAddCandidateSubmitting(true);
    companyApi
      .createCandidate({ email: email.trim(), full_name: full_name.trim() || undefined, password })
      .then((res) => companyApi.enrollCandidates(id, [res.data.id]))
      .then(() => {
        setAddCandidateSubmitting(false);
        setAddCandidateOpen(false);
        setAddCandidateForm({ full_name: "", email: "", password: "" });
        loadData();
      })
      .catch((e) => {
        const msg = getApiErrorMessage(e?.response?.data?.detail, "Failed to add candidate.");
        if (e?.response?.status === 400 && typeof msg === "string" && msg.toLowerCase().includes("exist")) {
          companyApi.listCandidates().then((r) => {
            const existing = (r.data || []).find((c: any) => c.email.toLowerCase() === email.trim().toLowerCase());
            if (existing) {
              companyApi.enrollCandidates(id, [existing.id])
                .then(() => { setAddCandidateSubmitting(false); setAddCandidateOpen(false); loadData(); })
                .catch(() => { setAddCandidateSubmitting(false); setAddCandidateError("Candidate exists but couldn't enroll."); });
            } else { setAddCandidateError(msg); setAddCandidateSubmitting(false); }
          });
        } else { setAddCandidateError(msg); setAddCandidateSubmitting(false); }
      });
  };

  const loadResponses = (roundId: number) => {
    companyApi.listResponsesByRound(id, roundId).then((r) => setResponsesByRound((prev) => ({ ...prev, [roundId]: r.data })));
    setViewRoundId(roundId);
  };

  const openLivePicker = (roundId: number) => {
    setLivePickerRoundId(roundId);
    setLivePickerError(null);
    setLivePickerOpen(true);
  };

  const handleStartLiveInterview = async (candidateId: number) => {
    if (!livePickerRoundId) return;
    setLivePickerSubmitting(candidateId);
    setLivePickerError(null);
    router.push(`/dashboard/company/interviews/${id}/rounds/${livePickerRoundId}/live?candidateId=${candidateId}`);
  };

  const openCandidateSummary = async (candidateId: number) => {
    setCandidateSummaryLoading(true);
    setCandidateSummaryOpen(true);
    setCandidateSummary(null);
    try {
      const res = await companyApi.candidateSummary(id, candidateId);
      setCandidateSummary(res.data);
    } catch (e: any) {
      setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load candidate summary"));
      setCandidateSummaryOpen(false);
    } finally {
      setCandidateSummaryLoading(false);
    }
  };

  const downloadCandidateReport = async (candidateId: number) => {
    setReportGenerating(true);
    setError(null);
    try {
      const res = await companyApi.generateCandidateReport(id, candidateId);
      const summary = (res.data.summary || res.data) as CandidateSummary;
      const report = res.data.report || summary.report || "No report available.";
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const ensureSpace = (needed = 24) => {
        if (y + needed > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      };
      const addTextBlock = (text: string, size = 11, gap = 16) => {
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(text || "—", contentWidth);
        for (const line of lines) {
          ensureSpace(size + 8);
          pdf.text(line, margin, y);
          y += size + 4;
        }
        y += gap;
      };

      pdf.setFontSize(18);
      pdf.text(`Candidate Report: ${summary.candidate_name || summary.candidate_email}`, margin, y);
      y += 24;
      addTextBlock(
        `Interview report\nEmail: ${summary.candidate_email}\nRank: ${summary.overall_rank ?? "—"} / ${summary.total_candidates}\nOverall: ${summary.total_weighted_score}\nDecision: ${recommendationLabel(summary.recommendation_status)}\nSuitability: ${summary.suitability_comment}\nWarnings: ${summary.total_warnings}\nVerification: ${summary.verification_status || "unknown"}`,
        11,
        12
      );
      addTextBlock("Performance Snapshot", 14, 10);
      addTextBlock(
        `Technical: ${summary.score_breakdown?.technical ?? 0}/100\nProblem Solving: ${summary.score_breakdown?.problem_solving ?? 0}/100\nCommunication: ${summary.score_breakdown?.communication ?? 0}/100\nOverall Fit: ${summary.score_breakdown?.overall_fit ?? 0}/100`,
        10,
        12
      );
      addTextBlock("AI Overall Report", 14, 10);
      addTextBlock(report, 11, 14);
      addTextBlock("Round Summary", 14, 10);
      summary.rounds.forEach((round) => {
        addTextBlock(
          `${round.round_type} (Order ${round.round_order})\nStatus: ${round.status}\nScore: ${round.score ?? "—"} / ${round.max_score ?? "—"}\nNormalized: ${round.normalized_score ?? "—"}\nWeighted: ${round.weighted_score ?? "—"}\nWarnings: ${round.warning_count}\nNotes: ${round.notes || "—"}`,
          10,
          10
        );
      });
      addTextBlock("Response Review", 14, 10);
      summary.responses.forEach((response, index) => {
        addTextBlock(
          `Response ${index + 1} — ${response.round_type || "Round"} | Q${response.question_id} | ${response.question_type}\nQuestion: ${response.question_content}\nAnswer: ${response.selected_option ? `${response.selected_option}${response.selected_option_text ? ` - ${response.selected_option_text}` : ""}` : response.candidate_answer || "—"}\nCorrect: ${response.correct_answer ? `${response.correct_answer}${response.correct_option_text ? ` - ${response.correct_option_text}` : ""}` : "—"}\nPlagiarism: ${response.plagiarism_warning ? "TRUE (effective score 0)" : "FALSE"}\nScore: ${response.effective_score ?? response.score ?? "—"} / ${response.max_score ?? "—"}`,
          10,
          10
        );
      });
      if (summary.proctoring_events?.length) {
        addTextBlock("Warnings and Proctoring Events", 14, 10);
        summary.proctoring_events.forEach((event) => {
          addTextBlock(`${event.created_at} - ${event.type}`, 10, 6);
        });
      }
      pdf.save(`${(summary.candidate_name || summary.candidate_email || "candidate").replace(/[^a-z0-9]+/gi, "_")}_report.pdf`);
    } catch (e: any) {
      setError(getApiErrorMessage(e?.response?.data?.detail, "Report generation failed"));
    } finally {
      setReportGenerating(false);
    }
  };

  const generateReportForView = async () => {
    if (!candidateSummary) return;
    setCandidateSummaryLoading(true);
    setError(null);
    try {
      const res = await companyApi.generateCandidateReport(id, candidateSummary.candidate_id);
      const report = res.data.report || (res.data.summary && (res.data.summary as CandidateSummary).report) || "";
      setCandidateSummary((prev) => prev ? { ...prev, report } : null);
    } catch (e: any) {
      setError(getApiErrorMessage(e?.response?.data?.detail, "Report generation failed"));
    } finally {
      setCandidateSummaryLoading(false);
    }
  };

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;

  const totalWeightage = rounds.reduce((sum, r) => sum + (r.weightage || 0), 0);

  const recommendationTone = (status?: string | null) => {
    if (status === "recommended") return "border-emerald-700/60 bg-emerald-950/40 text-emerald-300";
    if (status === "waiting_list") return "border-amber-700/60 bg-amber-950/40 text-amber-300";
    return "border-red-700/60 bg-red-950/40 text-red-300";
  };

  const recommendationLabel = (status?: string | null) => {
    if (!status) return "Unknown";
    return status.replace("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const formatSimpleValue = (value: unknown): string => {
    if (value == null) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return Number.isFinite(value) ? `${value}` : "—";
    if (Array.isArray(value)) return value.map((item) => formatSimpleValue(item)).join(", ");
    if (typeof value === "object") return "";
    return String(value);
  };

  const renderPlagiarismSummary = (data?: Record<string, unknown> | null) => {
    if (!data) return null;
    return (
      <div className="space-y-1 text-xs text-slate-300">
        {"warning" in data && <p>Flagged: <span className={data.warning ? "text-red-400" : "text-emerald-400"}>{data.warning ? "Yes" : "No"}</span></p>}
        {"ai_generated_score" in data && <p>AI generation score: {formatSimpleValue(data.ai_generated_score)}</p>}
        {"source_match_score" in data && <p>Source match score: {formatSimpleValue(data.source_match_score)}</p>}
        {"plagiarism_checked" in data && <p>Checked: {formatSimpleValue(data.plagiarism_checked)}</p>}
        {"max_similarity" in data && <p>Max similarity: {formatSimpleValue(data.max_similarity)}</p>}
        {"cross_plagiarism_checked" in data && <p>Cross-check complete: {formatSimpleValue(data.cross_plagiarism_checked)}</p>}
        {Array.isArray(data.similar_responses) && data.similar_responses.length > 0 && (
          <div>
            <p>Similar responses:</p>
            {data.similar_responses.map((item, idx) => (
              <p key={idx} className="text-slate-400">• {formatSimpleValue(item)}</p>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderGradingDetails = (details?: Record<string, unknown> | null) => {
    if (!details) return null;
    const results = Array.isArray(details.results) ? details.results as Array<Record<string, unknown>> : [];
    return (
      <div className="space-y-2 text-xs text-slate-300">
        <div className="grid gap-1 md:grid-cols-4">
          {"passed" in details && <p>Passed: {formatSimpleValue(details.passed)}</p>}
          {"failed" in details && <p>Failed: {formatSimpleValue(details.failed)}</p>}
          {"total" in details && <p>Total: {formatSimpleValue(details.total)}</p>}
          {"method" in details && <p>Method: {formatSimpleValue(details.method)}</p>}
        </div>
        {results.length > 0 && (
          <div className="space-y-1">
            {results.map((result, idx) => (
              <div key={idx} className="rounded border border-slate-800 bg-slate-900/60 p-2">
                <p>Test case {idx + 1}: <span className={result.passed ? "text-emerald-400" : "text-red-400"}>{result.passed ? "Passed" : "Failed"}</span></p>
                {"input" in result && <p className="whitespace-pre-wrap text-slate-400">Input: {formatSimpleValue(result.input)}</p>}
                {"expected" in result && <p className="whitespace-pre-wrap text-slate-400">Expected: {formatSimpleValue(result.expected)}</p>}
                {"actual" in result && <p className="whitespace-pre-wrap text-slate-400">Actual: {formatSimpleValue(result.actual)}</p>}
                {"error" in result && result.error && <p className="whitespace-pre-wrap text-red-400">Error: {formatSimpleValue(result.error)}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="space-y-6 p-6 md:p-8">
      <header className="flex flex-col gap-4">
        <Link href="/dashboard/company" className="text-sm text-violet-400 hover:text-violet-300">← Back to Interviews</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">{interview?.name || "Interview"}</h1>
            {interview?.description && <p className="mt-1 text-sm text-slate-400">{interview.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                interview?.status === "draft" ? "bg-sky-500/20 text-sky-300" :
                interview?.status === "active" || interview?.status === "in_progress" ? "bg-emerald-500/20 text-emerald-300" :
                interview?.status === "completed" ? "bg-violet-500/20 text-violet-300" :
                interview?.status === "terminated" ? "bg-red-500/20 text-red-300" : "bg-slate-600 text-slate-300"
              }`}>
                {interview?.status ?? "draft"}
              </span>
              {interview?.follow_order !== false && (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300">Sequential Order</span>
              )}
              {interview?.shortlist_count != null && interview.shortlist_count > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">Shortlist Top {interview.shortlist_count}</span>
              )}
            </div>
            {interview?.scheduled_start && (
              <p className="mt-2 text-xs text-slate-500">
                Scheduled: {new Date(interview.scheduled_start).toLocaleString()}
                {interview.scheduled_end && ` — ${new Date(interview.scheduled_end).toLocaleString()}`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setEditInterviewOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">
              <span aria-hidden>✎</span> Edit
            </button>
            <Link href={`/dashboard/company/interviews/${id}/responses`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">
              <span aria-hidden>📄</span> View Responses
            </Link>
            {interview?.status === "draft" && (
              <button onClick={() => handleStatusChange("activate")} disabled={submitting} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                <span aria-hidden>⚡</span> Activate Interview
              </button>
            )}
            {(interview?.status === "active" || interview?.status === "in_progress") && (
              <>
                <button onClick={() => handleStatusChange("end")} disabled={submitting} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50">
                  End Interview
                </button>
                <button onClick={() => handleStatusChange("terminate")} disabled={submitting} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
                  Terminate
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {error && <p className="rounded-lg bg-red-950/40 px-4 py-2 text-sm text-red-400">{error}</p>}

      {candidateSummaryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setCandidateSummaryOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {candidateSummary?.candidate_name || "Candidate"} {candidateSummary?.candidate_email ? `(${candidateSummary.candidate_email})` : ""}
                </h3>
                {candidateSummary && (
                  <p className="mt-1 text-sm text-slate-400">
                    Rank {candidateSummary.overall_rank ?? "—"} / {candidateSummary.total_candidates} • Weighted score {candidateSummary.total_weighted_score.toFixed(2)} • {recommendationLabel(candidateSummary.recommendation_status)} • Warnings {candidateSummary.total_warnings}
                  </p>
                )}
              </div>
              <button onClick={() => setCandidateSummaryOpen(false)} className="text-slate-400 hover:text-white">X</button>
            </div>
            <div className="space-y-6 p-5">
              {candidateSummaryLoading && <p className="text-sm text-slate-400">Loading candidate details...</p>}
              {candidateSummary && (
                <>
                  <section className="rounded-xl border border-fuchsia-900/50 bg-gradient-to-br from-fuchsia-950/40 to-slate-950/80 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-4xl">
                        <h4 className="text-lg font-semibold text-white">AI Performance Report</h4>
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          {candidateSummary.suitability_comment}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-white">{candidateSummary.total_weighted_score.toFixed(0)}%</p>
                        <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${recommendationTone(candidateSummary.recommendation_status)}`}>
                          {recommendationLabel(candidateSummary.recommendation_status)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-4">
                      {[
                        ["Technical", candidateSummary.score_breakdown.technical ?? 0],
                        ["Problem Solving", candidateSummary.score_breakdown.problem_solving ?? 0],
                        ["Communication", candidateSummary.score_breakdown.communication ?? 0],
                        ["Overall Fit", candidateSummary.score_breakdown.overall_fit ?? 0],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-slate-300">{label}</p>
                            <p className="text-sm font-semibold text-white">{Number(value).toFixed(0)}/100</p>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-slate-800">
                            <div className="h-2 rounded-full bg-fuchsia-500" style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                        <h5 className="text-sm font-semibold text-emerald-300">Strengths</h5>
                        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
                          {(candidateSummary.report || "No report available.")
                            .split(/\n+/)
                            .filter((line) => /strength|good|strong|well|shined|performed/i.test(line))
                            .slice(0, 5)
                            .map((line, idx) => <p key={idx}>• {line.replace(/^[-*]\s*/, "")}</p>)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                        <h5 className="text-sm font-semibold text-rose-300">Weaknesses</h5>
                        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
                          {(candidateSummary.report || "No report available.")
                            .split(/\n+/)
                            .filter((line) => /weak|miss|gap|struggle|poor|risk|issue/i.test(line))
                            .slice(0, 6)
                            .map((line, idx) => <p key={idx}>• {line.replace(/^[-*]\s*/, "")}</p>)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <h5 className="text-sm font-semibold text-white">Hiring Recommendation</h5>
                      <p className="mt-2 text-sm text-slate-300">
                        Decision: <span className="font-medium text-white">{recommendationLabel(candidateSummary.recommendation_status)}</span>
                      </p>
                      <p className="mt-2 text-sm text-slate-300">
                        {candidateSummary.suitability_comment}
                      </p>
                    </div>
                  </section>

                  <section className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <h4 className="mb-3 text-lg font-medium text-white">Round Performance</h4>
                      <div className="space-y-3">
                        {candidateSummary.rounds.map((round) => (
                          <div key={round.round_id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-white">{round.round_type}</p>
                                <p className="text-xs text-slate-400">Order {round.round_order} • Status {round.status} • Warnings {round.warning_count}</p>
                              </div>
                              <div className="text-right text-sm">
                                <p className="text-sky-400">{round.score ?? "—"} / {round.max_score ?? "—"}</p>
                                <p className="text-xs text-slate-400">Norm {round.normalized_score ?? "—"} • Weighted {round.weighted_score ?? "—"}</p>
                              </div>
                            </div>
                            {round.notes && <p className="mt-2 text-sm text-slate-300">{round.notes}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <h4 className="mb-3 text-lg font-medium text-white">Warnings Timeline</h4>
                      <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
                        {candidateSummary.proctoring_events.length === 0 && <p className="text-slate-500">No proctoring events recorded.</p>}
                        {candidateSummary.proctoring_events.map((event, index) => (
                          <div key={`${event.created_at}-${index}`} className="rounded border border-slate-800 bg-slate-900/60 p-3">
                            <p className="font-medium text-white">{event.type}</p>
                            <p className="text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h4 className="text-lg font-medium text-white">AI Full Report</h4>
                      {!candidateSummary.report && (
                        <button
                          type="button"
                          onClick={generateReportForView}
                          disabled={candidateSummaryLoading}
                          className="rounded bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500 disabled:opacity-50"
                        >
                          {candidateSummaryLoading ? "Generating…" : "Generate report"}
                        </button>
                      )}
                    </div>
                    <div className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap text-sm text-slate-300">
                      {candidateSummaryLoading && !candidateSummary.report ? "Generating AI report…" : (candidateSummary.report || "No report generated yet. Click \"Generate report\" above.")}
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <h4 className="mb-3 text-lg font-medium text-white">Structured Responses</h4>
                    <div className="space-y-4">
                      {candidateSummary.responses.length === 0 && <p className="text-sm text-slate-400">No responses captured yet.</p>}
                      {candidateSummary.responses.map((response) => (
                        <div key={response.response_id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium text-white">{response.round_type || "Round"} • Q{response.question_id} • {response.question_type}</p>
                              <p className="text-xs text-slate-400">{new Date(response.created_at).toLocaleString()}</p>
                            </div>
                            <div className="text-right text-sm">
                              <p className={response.plagiarism_warning ? "text-red-400" : "text-sky-400"}>{response.effective_score ?? response.score ?? "—"} / {response.max_score ?? "—"}</p>
                              <p className={response.plagiarism_warning ? "text-red-400 text-xs" : "text-emerald-400 text-xs"}>
                                Plagiarism: {response.plagiarism_warning ? "TRUE - score counted as 0" : "FALSE"}
                              </p>
                              {response.question_type === "mcq" && (
                                <p className={response.is_correct ? "text-green-400" : "text-red-400"}>
                                  {response.is_correct ? "Correct" : "Wrong"}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 space-y-2 text-sm">
                            <div>
                              <p className="text-slate-400">Question</p>
                              <p className="whitespace-pre-wrap text-slate-200">{response.question_content}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Candidate answer</p>
                              <p className="whitespace-pre-wrap text-slate-200">
                                {response.selected_option
                                  ? `${response.selected_option}${response.selected_option_text ? ` - ${response.selected_option_text}` : ""}`
                                  : response.candidate_answer || "—"}
                              </p>
                            </div>
                            {response.correct_answer && (
                              <div>
                                <p className="text-slate-400">Correct answer</p>
                                <p className="whitespace-pre-wrap text-slate-200">
                                  {response.correct_answer}{response.correct_option_text ? ` - ${response.correct_option_text}` : ""}
                                </p>
                              </div>
                            )}
                            {(response.plagiarism || response.cross_plagiarism) && (
                              <div className="grid gap-2 md:grid-cols-2">
                                <div className="rounded border border-slate-800 bg-slate-950/70 p-2">
                                  <p className="text-xs uppercase tracking-wide text-slate-400">Plagiarism</p>
                                  <div className="mt-1">
                                    {renderPlagiarismSummary(response.plagiarism)}
                                  </div>
                                </div>
                                <div className="rounded border border-slate-800 bg-slate-950/70 p-2">
                                  <p className="text-xs uppercase tracking-wide text-slate-400">Cross plagiarism</p>
                                  <div className="mt-1">
                                    {renderPlagiarismSummary(response.cross_plagiarism)}
                                  </div>
                                </div>
                              </div>
                            )}
                            {response.grading_details && (
                              <div className="rounded border border-slate-800 bg-slate-950/70 p-2">
                                <p className="text-xs uppercase tracking-wide text-slate-400">AI grading details</p>
                                <div className="mt-1">
                                  {renderGradingDetails(response.grading_details)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {livePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => livePickerSubmitting == null && setLivePickerOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Start Live Interview</h3>
                <p className="text-sm text-slate-400">Choose a candidate from this interview to create the meeting.</p>
              </div>
              <button
                onClick={() => livePickerSubmitting == null && setLivePickerOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                X
              </button>
            </div>
            <div className="space-y-4 p-5">
              {livePickerError && <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-300">{livePickerError}</p>}
              {enrolled.length === 0 ? (
                <p className="text-sm text-slate-400">No candidates are enrolled in this interview yet.</p>
              ) : (
                <div className="space-y-3">
                  {enrolled.map((candidate) => {
                    const isVerified = candidate.verification_status === "approved" || candidate.verification_status === "completed";
                    return (
                      <div
                        key={candidate.id}
                        className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-white">{candidate.full_name || "Unnamed Candidate"}</p>
                          <p className="text-sm text-slate-400">{candidate.email}</p>
                          <p className={`text-xs ${isVerified ? "text-green-400" : "text-amber-400"}`}>
                            {isVerified ? "Verification complete" : "Verification pending"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleStartLiveInterview(candidate.id)}
                          disabled={livePickerSubmitting !== null}
                          className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {livePickerSubmitting === candidate.id ? "Starting..." : "Start"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Round Modal */}
      {addRoundOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !submitting && setAddRoundOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-landing-card/95 p-6 shadow-xl backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Add Round</h3>
                <p className="mt-1 text-sm text-slate-400">Select a round type and configure its parameters. Fields marked * are required.</p>
              </div>
              <button type="button" onClick={() => !submitting && setAddRoundOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleAddRound} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Round Type <span className="text-red-400">*</span></label>
                <select value={newRound.type} onChange={(e) => setNewRound((r) => ({ ...r, type: e.target.value }))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" required>
                  <option value="APT_QUANT" className="bg-slate-800 text-white">General/Quant Aptitude</option>
                  <option value="APT_TECH" className="bg-slate-800 text-white">Technical Aptitude</option>
                  <option value="APT_MIXED" className="bg-slate-800 text-white">Mixed Aptitude</option>
                  <option value="CODING" className="bg-slate-800 text-white">Coding</option>
                  <option value="GD" className="bg-slate-800 text-white">Group Discussion</option>
                  <option value="TECH_INTERVIEW" className="bg-slate-800 text-white">Technical Interview</option>
                  <option value="HR_INTERVIEW" className="bg-slate-800 text-white">HR/General Interview</option>
                  <option value="LIVE_INTERVIEW" className="bg-slate-800 text-white">Live Interview</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Duration (minutes) <span className="text-red-400">*</span></label>
                <input type="number" min={1} value={newRound.duration_minutes} onChange={(e) => setNewRound((r) => ({ ...r, duration_minutes: parseInt(e.target.value, 10) || 30 }))} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Weightage (%) <span className="text-red-400">*</span></label>
                <input type="number" min={0} max={100} placeholder="e.g. 30" value={newRound.weightage} onChange={(e) => setNewRound((r) => ({ ...r, weightage: parseFloat(e.target.value) || 0 }))} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500" />
                <p className="mt-1 text-xs text-slate-500">All round weightages must sum to 100</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Number of Questions <span className="text-red-400">*</span></label>
                <input type="number" min={1} value={newRound.num_questions} onChange={(e) => setNewRound((r) => ({ ...r, num_questions: parseInt(e.target.value, 10) || 20 }))} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Difficulty <span className="text-red-400">*</span></label>
                <select value={newRound.difficulty} onChange={(e) => setNewRound((r) => ({ ...r, difficulty: e.target.value }))} className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" required>
                  <option value="Easy" className="bg-slate-800 text-white">Easy</option>
                  <option value="Medium" className="bg-slate-800 text-white">Medium</option>
                  <option value="Hard" className="bg-slate-800 text-white">Hard</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Domains (comma-separated) <span className="text-red-400">*</span></label>
                <input type="text" placeholder="e.g. Profit &amp; Loss, Percentages, Time &amp; Work, Averages, Ratio &amp; Proportion" value={newRound.domains} onChange={(e) => setNewRound((r) => ({ ...r, domains: e.target.value }))} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500" />
                <p className="mt-1 text-xs text-slate-500">AI uses these domains to generate relevant questions</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => !submitting && setAddRoundOpen(false)} className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">{submitting ? "Adding…" : "Add Round"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Interview Modal */}
      {editInterviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !submitting && setEditInterviewOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-landing-card/95 p-8 shadow-xl backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-white">Edit Interview</h2>
            <form onSubmit={handleEditInterview} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Interview Name</label>
                <input type="text" required value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Description (optional)</label>
                <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-300">Sequential Round Order</p>
                  <p className="text-xs text-slate-500">Candidates must complete rounds in order.</p>
                </div>
                <button type="button" role="switch" aria-checked={editForm.follow_order} onClick={() => setEditForm((p) => ({ ...p, follow_order: !p.follow_order }))} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${editForm.follow_order ? "bg-violet-600" : "bg-slate-600"}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow ${editForm.follow_order ? "left-7" : "left-1"}`} />
                </button>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Shortlist Count (optional)</label>
                <input type="number" min={1} value={editForm.shortlist_count === "" ? "" : editForm.shortlist_count} onChange={(e) => { const v = e.target.value; setEditForm((p) => ({ ...p, shortlist_count: v === "" ? "" : parseInt(v, 10) || "" })); }} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">Start</label>
                  <input type="datetime-local" value={editForm.scheduled_start} onChange={(e) => setEditForm((p) => ({ ...p, scheduled_start: e.target.value }))} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">End</label>
                  <input type="datetime-local" value={editForm.scheduled_end} onChange={(e) => setEditForm((p) => ({ ...p, scheduled_end: e.target.value }))} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => !submitting && setEditInterviewOpen(false)} className="flex-1 rounded-lg border border-white/20 py-2 text-sm font-medium text-slate-300 hover:bg-white/10">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">{submitting ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {bulkUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !submitting && setBulkUploadOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-landing-card/95 p-6 shadow-xl backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white">Bulk Upload Candidates</h3>
            <p className="mt-1 text-sm text-slate-400">CSV/Excel with email, name, password columns.</p>
            <form onSubmit={handleBulkEnroll} className="mt-4 space-y-4">
              <input ref={bulkFileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setBulkFile(e.target.files?.[0] || null)} className="hidden" />
              <button type="button" onClick={() => bulkFileInputRef.current?.click()} className="w-full rounded-lg border border-dashed border-slate-500 bg-slate-900/50 py-4 text-sm text-slate-400 hover:bg-slate-800/50">
                {bulkFile ? bulkFile.name : "Choose file"}
              </button>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Password column index (0-based)</label>
                <input type="number" min={0} value={passwordCol} onChange={(e) => setPasswordCol(parseInt(e.target.value, 10) || 0)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => !submitting && setBulkUploadOpen(false)} className="flex-1 rounded-lg border border-white/20 py-2 text-sm font-medium text-slate-300 hover:bg-white/10">Cancel</button>
                <button type="submit" disabled={submitting || !bulkFile} className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">{submitting ? "Uploading…" : "Upload"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rounds Section */}
      <section className="rounded-2xl border border-white/10 bg-landing-card/60 p-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Rounds ({rounds.length})</h2>
            <p className="mt-1 text-sm text-slate-400">
              {interview?.status === "draft" ? "Configure the interview pipeline. Reorder rounds before activating." : "Interview is active. Rounds cannot be modified."}
            </p>
          </div>
          {interview?.status === "draft" && (
            <button type="button" onClick={() => { setAddRoundOpen(true); setNewRound((prev) => ({ ...prev, order: rounds.length + 1 })); }} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
              <span aria-hidden>+</span> Add Round
            </button>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {rounds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 py-12 text-center text-slate-500">
              No rounds configured yet. Add your first round above.
            </div>
          ) : (
            rounds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/50 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600/80 text-sm font-bold text-white">{r.order}</div>
                  <div>
                    <p className="font-medium text-white">{ROUND_TYPE_LABEL[r.type] ?? r.type}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className={r.status === "active" ? "text-emerald-400" : ""}>{r.status}</span>
                      <span>{r.duration_minutes ?? 0} min</span>
                      {(r.weightage ?? 0) > 0 && <span className="text-violet-400">Weight: {r.weightage}%</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.type !== "LIVE_INTERVIEW" && (
                    <Link href={`/dashboard/company/interviews/${id}/rounds/${r.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800" onClick={(e) => e.stopPropagation()}>
                      <span aria-hidden>📄</span> Questions
                    </Link>
                  )}
                  {r.type === "LIVE_INTERVIEW" && (
                    <button type="button" onClick={() => openLivePicker(r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/60 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950/30">
                      Start Live
                    </button>
                  )}
                  <button type="button" onClick={() => loadResponses(r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800">
                    Responses
                  </button>
                  {interview?.status === "draft" && (
                    <button type="button" onClick={() => handleDeleteRound(r.id)} disabled={submitting} className="rounded-lg border border-red-800/50 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/40 disabled:opacity-50">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {viewRoundId != null && responsesByRound[viewRoundId] && (
          <div className="mt-4 rounded-xl border border-slate-700 p-4 text-sm">
            <h3 className="mb-2 font-medium text-white">Responses for round {viewRoundId}</h3>
            <p className="mb-3 text-xs text-slate-400">Shows every candidate response for this round, including warnings and plagiarism result.</p>
            <div className="max-h-[28rem] space-y-3 overflow-y-auto">
              {Object.entries((responsesByRound[viewRoundId] || []).reduce<Record<string, ResponseRow[]>>((acc, row) => {
                const key = `${row.candidate_id}`;
                acc[key] = acc[key] || [];
                acc[key].push(row);
                return acc;
              }, {})).map(([candidateId, rows]) => (
                <div key={candidateId} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{rows[0]?.candidate_name || "Candidate"}</p>
                      <p className="text-xs text-slate-400">{rows[0]?.candidate_email}</p>
                    </div>
                    <p className="text-xs text-amber-300">Warnings: {rows[0]?.warning_count ?? 0}</p>
                  </div>
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <div key={row.id} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-white">Q{row.question_id} • {row.question_type || "answer"}</p>
                            <p className="mt-1 text-xs text-slate-400">{row.question_content}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className={row.plagiarism_warning ? "text-red-400" : "text-sky-400"}>
                              Score: {row.effective_score ?? row.score ?? "—"}
                            </p>
                            <p className={row.plagiarism_warning ? "text-red-400" : "text-emerald-400"}>
                              Plagiarism: {row.plagiarism_warning ? "TRUE" : "FALSE"}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-slate-300">{row.content || "—"}</p>
                        {(row.plagiarism || row.cross_plagiarism) && (
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <div className="rounded border border-slate-800 bg-slate-900/70 p-2 text-xs text-slate-300">
                              <p className="mb-1 font-medium text-slate-200">Plagiarism</p>
                              {row.plagiarism ? renderPlagiarismSummary(row.plagiarism) : <p className="text-slate-500">Not checked</p>}
                            </div>
                            <div className="rounded border border-slate-800 bg-slate-900/70 p-2 text-xs text-slate-300">
                              <p className="mb-1 font-medium text-slate-200">Cross Plagiarism</p>
                              {row.cross_plagiarism ? renderPlagiarismSummary(row.cross_plagiarism) : <p className="text-slate-500">Not checked</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Candidates Section */}
      <section className="rounded-2xl border border-white/10 bg-landing-card/60 p-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Candidates ({enrolled.length})</h2>
            <p className="mt-1 text-sm text-slate-400">Candidates enrolled in this interview. Add individually or bulk upload.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setBulkUploadOpen(true); setBulkFile(null); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">
              <span aria-hidden>↑</span> Bulk Upload
            </button>
            <button type="button" onClick={() => { setAddCandidateOpen(true); setAddCandidateError(null); }} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
              <span aria-hidden>+</span> Add Candidate
            </button>
          </div>
        </div>

          {addCandidateOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !addCandidateSubmitting && setAddCandidateOpen(false)}>
              <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
                  <h3 className="text-lg font-semibold text-white">Add Candidate</h3>
                  <button onClick={() => !addCandidateSubmitting && setAddCandidateOpen(false)} className="text-slate-400 hover:text-white">X</button>
                </div>
                <form onSubmit={handleAddCandidateSubmit} className="space-y-4 p-5">
                  {addCandidateError && <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-300">{addCandidateError}</p>}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Full Name</label>
                    <input type="text" value={addCandidateForm.full_name}
                      onChange={(e) => setAddCandidateForm((f) => ({ ...f, full_name: e.target.value }))}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Email *</label>
                    <input type="email" value={addCandidateForm.email}
                      onChange={(e) => setAddCandidateForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Password *</label>
                    <input type="password" value={addCandidateForm.password}
                      onChange={(e) => setAddCandidateForm((f) => ({ ...f, password: e.target.value }))}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" />
                  </div>
                  <button type="submit" disabled={addCandidateSubmitting || !addCandidateForm.email || !addCandidateForm.password}
                    className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                    {addCandidateSubmitting ? "Adding..." : "Add Candidate"}
                  </button>
                </form>
              </div>
            </div>
          )}

        <div className="mt-4 overflow-x-auto">
          {enrolled.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 py-12 text-center text-slate-500">
              No candidates enrolled yet. Add candidates individually or bulk upload a CSV/Excel file.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Verified</th>
                  <th className="pb-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrolled.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/80">
                    <td className="py-3 pr-4 font-medium text-white">{c.full_name || "—"}</td>
                    <td className="py-3 pr-4 text-slate-300">{c.email}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${(c.verification_status === "approved" || c.verification_status === "completed") ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                        {(c.verification_status === "approved" || c.verification_status === "completed") ? "Verified" : "Not Verified"}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => openCandidateSummary(c.id)} className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-emerald-300 hover:bg-slate-800">View</button>
                        <button type="button" onClick={() => downloadCandidateReport(c.id)} disabled={reportGenerating} className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-sky-400 hover:bg-slate-800 disabled:opacity-50">{reportGenerating ? "…" : "Report"}</button>
                        <button type="button" onClick={() => { if (!confirm(`Remove "${c.full_name || c.email}"?`)) return; setSubmitting(true); companyApi.removeCandidate(id, c.id).then(() => loadData()).catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Remove failed"))).finally(() => setSubmitting(false)); }} disabled={submitting} className="rounded-lg border border-red-800/50 p-1.5 text-red-300 hover:bg-red-950/40 disabled:opacity-50" aria-label="Remove">
                          <span aria-hidden>🗑</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

    </main>
  );
}
