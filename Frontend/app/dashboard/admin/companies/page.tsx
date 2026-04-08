"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, getApiErrorMessage, getToken } from "@/lib/api";

type Company = { id: number; name: string; contact_email: string | null; created_at?: string };

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkResult, setBulkResult] = useState<{ created: number; failed: number; errors: { row: number; error: string }[] } | null>(null);
  const [form, setForm] = useState({ name: "", admin_email: "", admin_password: "", admin_full_name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = () => {
    if (!getToken()) { window.location.href = "/login"; return; }
    adminApi
      .listCompanies()
      .then((r) => { setCompanies(r.data ?? []); setError(null); })
      .catch((e) => {
        if (e?.response?.status === 401) { window.location.href = "/login"; return; }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Failed to load"));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    adminApi
      .createCompany(form)
      .then(() => {
        setForm({ name: "", admin_email: "", admin_password: "", admin_full_name: "" });
        setAddOpen(false);
        return adminApi.listCompanies();
      })
      .then((r) => { setCompanies(r.data ?? []); setError(null); })
      .catch((e) => {
        if (e?.response?.status === 401) { window.location.href = "/login"; return; }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Create failed"));
      })
      .finally(() => setSubmitting(false));
  };

  const handleBulk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) return;
    setSubmitting(true);
    setBulkResult(null);
    adminApi
      .bulkCompanies(bulkFile)
      .then((r) => {
        setBulkResult(r.data);
        setBulkFile(null);
        return adminApi.listCompanies();
      })
      .then((r) => { setCompanies(r.data ?? []); setError(null); })
      .catch((e) => {
        if (e?.response?.status === 401) { window.location.href = "/login"; return; }
        setError(getApiErrorMessage(e?.response?.data?.detail, "Bulk upload failed"));
      })
      .finally(() => setSubmitting(false));
  };

  const handleDelete = (c: Company) => {
    if (!window.confirm(`Delete company "${c.name}" and all its data? This cannot be undone.`)) return;
    setSubmitting(true);
    adminApi
      .deleteCompany(c.id)
      .then(() => adminApi.listCompanies())
      .then((r) => { setCompanies(r.data ?? []); setError(null); })
      .catch((e) => setError(getApiErrorMessage(e?.response?.data?.detail, "Delete failed")))
      .finally(() => setSubmitting(false));
  };

  const filtered = companies.filter(
    (c) =>
      !search.trim() ||
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_email || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-white/70">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard/admin" className="text-sm text-white hover:text-white/80">← Back to Dashboard</Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Companies</h1>
        <p className="mt-1 text-white/70">Manage all registered companies on the platform.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">🔍</span>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pl-9 pr-3 text-sm text-white placeholder-white/50"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <form onSubmit={handleBulk} className="flex items-center gap-2">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
                className="text-sm text-white/70 file:mr-2 file:rounded file:border-0 file:bg-white file:text-black file:px-3 file:py-1 file:text-sm file:font-medium file:cursor-pointer hover:file:bg-white/90"
              />
              <button type="submit" disabled={submitting || !bulkFile} className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50">
                Bulk Upload
              </button>
            </form>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-white/90"
            >
              + Add Company
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-white/20">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/20 bg-white/5">
                <th className="px-4 py-3 font-medium text-white/70">Name</th>
                <th className="px-4 py-3 font-medium text-white/70">Email</th>
                <th className="px-4 py-3 font-medium text-white/70">Status</th>
                <th className="px-4 py-3 font-medium text-white/70">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-white/20 hover:bg-white/10">
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3 text-white/70">{c.contact_email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">Active</span>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      disabled={submitting}
                      className="rounded border border-red-800 bg-red-950/50 px-2 py-1 text-xs text-red-300 hover:bg-red-900/50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-white/70">{search.trim() ? "No companies match your search." : "No companies yet."}</p>
          )}
        </div>

        {bulkResult && (
          <p className="mt-4 text-sm text-white/70">
            Bulk: Created {bulkResult.created}, Failed {bulkResult.failed}
            {bulkResult.errors?.length ? ` — ${bulkResult.errors.length} errors` : ""}
          </p>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !submitting && setAddOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/20 bg-black p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white">Add Company</h3>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <input
                placeholder="Company name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm text-white placeholder-white/50"
              />
              <input
                type="email"
                placeholder="Admin email"
                required
                value={form.admin_email}
                onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
                className="w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm text-white placeholder-white/50"
              />
              <input
                type="password"
                placeholder="Password"
                required
                value={form.admin_password}
                onChange={(e) => setForm((f) => ({ ...f, admin_password: e.target.value }))}
                className="w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm text-white placeholder-white/50"
              />
              <input
                placeholder="Full name (optional)"
                value={form.admin_full_name}
                onChange={(e) => setForm((f) => ({ ...f, admin_full_name: e.target.value }))}
                className="w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm text-white placeholder-white/50"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setAddOpen(false)} className="flex-1 rounded-lg border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-white text-black py-2 text-sm font-medium hover:bg-white/90 disabled:opacity-50">{submitting ? "Adding…" : "Add"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
