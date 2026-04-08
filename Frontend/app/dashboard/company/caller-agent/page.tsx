"use client";

import { useMemo, useState } from "react";
import { getApiErrorMessage, shortlistApi } from "@/lib/api";

type CallDetail = {
  name?: string;
  email?: string;
  mobileNumber?: string;
  status: string;
  availabilityDate?: string;
  notes?: unknown;
  reason?: unknown;
  vapiCallId?: string;
  emailStatus?: { status: string; reason?: string; smtpStatus?: number; email?: string };
};

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function CallerAgentPage() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [activeAction, setActiveAction] = useState<"call" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<CallDetail[]>([]);

  const stats = useMemo(() => {
    return {
      called: details.filter((d) => d.status !== "failed" && d.status !== "skipped").length,
      failed: details.filter((d) => d.status === "failed").length,
      skipped: details.filter((d) => d.status === "skipped").length,
    };
  }, [details]);

  async function handleRunCalls() {
    if (activeAction) return;
    setError(null);
    if (!csvFile) {
      setError("Please upload a CSV file first.");
      return;
    }

    setActiveAction("call");
    try {
      const res = await shortlistApi.uploadCsvAndCall(csvFile);
      const normalized = (res.data?.details ?? []).map((d) => ({
        ...d,
        notes: toText(d.notes),
        reason: toText(d.reason),
      }));
      setDetails(normalized);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: unknown; message?: string } }; message?: string };
      setError(
        (typeof axErr?.response?.data?.message === "string" && axErr.response.data.message) ||
          getApiErrorMessage(axErr?.response?.data?.detail, axErr?.message || "Failed to trigger caller agent.")
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSendRound1Emails() {
    if (activeAction) return;
    setError(null);
    if (!csvFile) {
      setError("Please upload a CSV file first.");
      return;
    }

    setActiveAction("email");
    try {
      const res = await shortlistApi.uploadCsvAndEmail(csvFile);
      const normalized = (res.data?.details ?? []).map((d) => ({
        ...d,
        reason: toText(d.reason),
      }));
      setDetails(normalized);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: unknown; message?: string } }; message?: string };
      setError(
        (typeof axErr?.response?.data?.message === "string" && axErr.response.data.message) ||
          getApiErrorMessage(axErr?.response?.data?.detail, axErr?.message || "Failed to send round 1 emails.")
      );
    } finally {
      setActiveAction(null);
    }
  }

  function downloadCallReportCsv() {
    if (!details.length) return;

    const rows = [
      ["Name", "Phone Number", "Call Status", "Availability Date", "Notes"],
      ...details.map((d) => [
        d.name || "",
        d.mobileNumber || "",
        d.status || "",
        d.availabilityDate || "",
        toText(d.notes || d.reason),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `caller_agent_report_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-white/20 bg-black p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Caller Agent</h1>
            <p className="mt-2 text-zinc-400">
              Upload shortlisted CSV to trigger calls or send invitation emails. <br />
              <strong>CSV must include columns:</strong> Name, Phone Number, Email, Reason for shortlisting
            </p>
          </div>

          {/* File Upload & Actions */}
          <div className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-white mb-3">Upload CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-black hover:file:bg-zinc-200"
              />
              {csvFile && (
                <p className="mt-2 text-xs text-zinc-400">File: {csvFile.name}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleRunCalls}
                disabled={activeAction !== null}
                className="rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {activeAction === "call" ? "Calling..." : "📞 Run Caller Agent"}
              </button>

              <button
                type="button"
                onClick={handleSendRound1Emails}
                disabled={activeAction !== null}
                className="rounded-lg border border-white/30 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {activeAction === "email" ? "Sending..." : "📧 Send Round 1 Emails"}
              </button>

              <button
                type="button"
                onClick={downloadCallReportCsv}
                disabled={!details.length}
                className="rounded-lg border border-white/30 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                📥 Download Report CSV
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Stats */}
          {details.length > 0 && (
            <div className="mb-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-white/20 bg-black p-5">
                <p className="text-sm text-zinc-400 mb-2">Called Successfully</p>
                <p className="text-3xl font-bold text-white">{stats.called}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-black p-5">
                <p className="text-sm text-zinc-400 mb-2">Failed</p>
                <p className="text-3xl font-bold text-white">{stats.failed}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-black p-5">
                <p className="text-sm text-zinc-400 mb-2">Skipped</p>
                <p className="text-3xl font-bold text-white">{stats.skipped}</p>
              </div>
            </div>
          )}

          {/* Details List */}
          {details.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white mb-4">Call Results</h3>
              {details.map((d, idx) => (
                <div key={`${d.mobileNumber || "n"}-${idx}`} className="rounded-lg border border-white/10 bg-black/50 p-4 hover:border-white/20 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-white">{d.name || "Candidate"}</p>
                      <p className="text-sm text-zinc-400 mt-1">{d.mobileNumber || "No number"}</p>
                      {d.email && <p className="text-sm text-zinc-400">{d.email}</p>}
                      
                      <div className="mt-3 space-y-1">
                        <p className="text-xs text-zinc-300">
                          <span className="text-zinc-500">Status:</span> {d.status}
                        </p>
                        {d.availabilityDate && (
                          <p className="text-xs text-zinc-300">
                            <span className="text-zinc-500">Availability:</span> {d.availabilityDate}
                          </p>
                        )}
                        {d.emailStatus && (
                          <p className="text-xs text-zinc-300">
                            <span className="text-zinc-500">Email:</span> {d.emailStatus.status}
                            {d.emailStatus.reason ? ` - ${d.emailStatus.reason}` : ""}
                          </p>
                        )}
                        {Boolean(d.notes || d.reason) && (
                          <p className="text-xs text-zinc-300">
                            <span className="text-zinc-500">Notes:</span> {toText(d.notes || d.reason)}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`text-xl ${
                      d.status === "called" || d.status === "completed" ? "✓" : 
                      d.status === "failed" ? "✗" : "•"
                    }`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
