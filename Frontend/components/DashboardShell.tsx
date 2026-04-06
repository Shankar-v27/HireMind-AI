"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clearToken, candidateApi, companyApi, authApi, getToken } from "@/lib/api";

type Role = "candidate" | "company" | "admin";

function useDashboardUser() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; name: string | null; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/";
      return;
    }
    const segment = pathname?.split("/")[2] as Role | undefined;
    if (segment === "candidate") {
      candidateApi.me()
        .then((r) => setUser({ email: r.data.email, name: r.data.full_name ?? null, role: "candidate" }))
        .catch((e) => { if (e?.response?.status === 401) { clearToken(); window.location.href = "/"; } })
        .finally(() => setLoading(false));
    } else if (segment === "company") {
      companyApi.me()
        .then((r) => setUser({ email: r.data.contact_email ?? r.data.name ?? "", name: r.data.name ?? null, role: "company" }))
        .catch((e) => { if (e?.response?.status === 401) { clearToken(); window.location.href = "/"; } })
        .finally(() => setLoading(false));
    } else if (segment === "admin") {
      authApi.me()
        .then((r) => setUser({ email: r.data.email, name: r.data.full_name ?? null, role: r.data.role }))
        .catch((e) => { if (e?.response?.status === 401) { clearToken(); window.location.href = "/"; } })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [pathname]);

  return { user, loading };
}

const nav = {
  candidate: [
    { href: "/dashboard/candidate", label: "Dashboard", icon: "▦" },
    { href: "/dashboard/candidate/verification", label: "Verification", icon: "🛡" },
    { href: "/dashboard/candidate/interviews", label: "Interviews", icon: "📋" },
  ],
  company: [
    { href: "/dashboard/company", label: "Dashboard", icon: "▦" },
    { href: "/dashboard/company", label: "Interviews", icon: "📋" },
  ],
  admin: [
    { href: "/dashboard/admin", label: "Dashboard", icon: "▦" },
    { href: "/dashboard/admin/companies", label: "Companies", icon: "🏢" },
  ],
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useDashboardUser();
  const segment = pathname?.split("/")[2] as Role | undefined;
  const links = segment ? nav[segment] ?? nav.candidate : nav.candidate;
  const roleLabel = user?.role === "admin" ? "admin" : user?.role === "candidate" ? "candidate" : "company";
  const displayName = user?.name || user?.email?.split("@")[0] || "User";
  const initial = (displayName[0] ?? "U").toUpperCase();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-black text-zinc-100">
      <aside className="flex w-56 flex-col border-r border-white/10 bg-zinc-950">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-black">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
              <path d="M20 12a8 8 0 1 0-16 0 8 8 0 0 0 16 0Z" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          </div>
          <span className="font-semibold text-white">{segment === "candidate" ? "HireMind AI" : "HIREMIND"}</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {segment === "company" ? (
            <>
              <Link
                href="/dashboard/company"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  pathname === "/dashboard/company"
                    ? "bg-zinc-100 text-black"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <span>▦</span> Dashboard
              </Link>
              <Link
                href="/dashboard/company/interviews"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  pathname?.startsWith("/dashboard/company/interviews")
                    ? "bg-zinc-100 text-black"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <span>📋</span> Interviews
              </Link>
            </>
          ) : segment === "admin" ? (
            <>
              <Link
                href="/dashboard/admin"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  pathname === "/dashboard/admin"
                    ? "bg-zinc-100 text-black"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <span>▦</span> Dashboard
              </Link>
              <Link
                href="/dashboard/admin/companies"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  pathname?.startsWith("/dashboard/admin/companies")
                    ? "bg-zinc-100 text-black"
                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <span>🏢</span> Companies
              </Link>
            </>
          ) : (
            links.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href === "/dashboard/candidate/interviews" && pathname?.startsWith("/dashboard/candidate/interviews"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    isActive ? "bg-zinc-100 text-black" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <span>{item.icon}</span> {item.label}
                </Link>
              );
            })
          )}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{user?.email ?? "—"}</p>
              {segment === "candidate" ? (
                <span className="mt-0.5 inline-block rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">candidate</span>
              ) : (
                <p className="text-xs text-zinc-600">{roleLabel}</p>
              )}
            </div>
            {segment === "candidate" && (
              <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
          <button
            type="button"
            onClick={() => { clearToken(); window.location.href = "/"; }}
            className="mt-2 w-full rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-black">
        {children}
      </main>
    </div>
  );
}
