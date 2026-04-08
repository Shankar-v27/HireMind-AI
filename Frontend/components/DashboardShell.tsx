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
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-black text-white">
      <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col border-r border-white/20 bg-black">
        <div className="flex items-center gap-3 border-b border-white/20 px-6 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-black font-bold">
            H
          </div>
          <span className="font-bold text-white text-lg">HireMind</span>
        </div>
        
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {segment === "company" ? (
            <>
              <Link
                href="/dashboard/company"
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                  pathname === "/dashboard/company"
                    ? "bg-white text-black"
                    : "text-zinc-300 hover:bg-white/10"
                }`}
              >
                <span className="text-base">▦</span> Dashboard
              </Link>
              <Link
                href="/dashboard/company/interviews"
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                  pathname?.startsWith("/dashboard/company/interviews")
                    ? "bg-white text-black"
                    : "text-zinc-300 hover:bg-white/10"
                }`}
              >
                <span className="text-base">📋</span> Interviews
              </Link>
              <Link
                href="/dashboard/company/caller-agent"
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                  pathname?.startsWith("/dashboard/company/caller-agent")
                    ? "bg-white text-black"
                    : "text-zinc-300 hover:bg-white/10"
                }`}
              >
                <span className="text-base">📞</span> Caller Agent
              </Link>
            </>
          ) : segment === "admin" ? (
            <>
              <Link
                href="/dashboard/admin"
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                  pathname === "/dashboard/admin"
                    ? "bg-white text-black"
                    : "text-zinc-300 hover:bg-white/10"
                }`}
              >
                <span className="text-base">▦</span> Dashboard
              </Link>
              <Link
                href="/dashboard/admin/companies"
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                  pathname?.startsWith("/dashboard/admin/companies")
                    ? "bg-white text-black"
                    : "text-zinc-300 hover:bg-white/10"
                }`}
              >
                <span className="text-base">🏢</span> Companies
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
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                    isActive ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  <span className="text-base">{item.icon}</span> {item.label}
                </Link>
              );
            })
          )}
        </nav>
        
        <div className="border-t border-white/20 p-4">
          <div className="flex items-center gap-3 rounded-lg px-3 py-3 mb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black text-sm font-bold">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.email ?? "—"}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { clearToken(); window.location.href = "/"; }}
            className="w-full rounded-lg border border-white/30 px-3 py-2.5 text-xs font-medium text-white hover:bg-white/10 transition"
          >
            Sign out
          </button>
        </div>
      </aside>
      
      <main className="flex-1 ml-64 overflow-auto bg-black">
        {children}
      </main>
    </div>
  );
}
