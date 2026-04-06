"use client";

import { useMemo, useState } from "react";
import { getApiErrorMessage, shortlistApi } from "@/lib/api";

type CallDetail = {
  name?: string;
  mobileNumber?: string;
  status: string;
  availabilityDate?: string;
  notes?: unknown;
  reason?: unknown;
  vapiCallId?: string;
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
  const [loading, setLoading] = useState(false);
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
    setError(null);
    if (!csvFile) {
      setError("Please upload a CSV file first.");
      return;
    }

    setLoading(true);
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
      setLoading(false);
    }
  }

  function downloadCallReportCsv() {
    if (!details.length) return;

    const rows = [
      ["Name", "Mobile Number", "Call Status", "Availability Date", "Notes"],
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
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-2xl font-bold text-white">Caller Agent</h1>
        <p className="mt-1 text-sm text-slate-400">
          Upload shortlisted CSV and trigger Vapi calls to candidates. CSV should include Name and Mobile Number columns.
        </p>

        <div className="mt-5 space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-500"
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRunCalls}
              disabled={loading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Calling..." : "Run Caller Agent"}
            </button>

            <button
              type="button"
              onClick={downloadCallReportCsv}
              disabled={!details.length}
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Download Call Report CSV
            </button>
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-white">Called: {stats.called}</div>
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-white">Failed: {stats.failed}</div>
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-white">Skipped: {stats.skipped}</div>
        </div>

        {details.length > 0 && (
          <div className="mt-6 space-y-3">
            {details.map((d, idx) => (
              <div key={`${d.mobileNumber || "n"}-${idx}`} className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                <p className="text-sm font-medium text-white">{d.name || "Candidate"}</p>
                <p className="text-xs text-slate-400">{d.mobileNumber || "No number"}</p>
                <p className="mt-1 text-xs text-slate-300">Status: {d.status}</p>
                {d.availabilityDate && <p className="text-xs text-emerald-300">Availability: {d.availabilityDate}</p>}
                {Boolean(d.notes || d.reason) && <p className="mt-1 text-xs text-slate-300">{toText(d.notes || d.reason)}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
