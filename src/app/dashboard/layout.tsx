import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/access";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-neutral-50/70 text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/30 transition-transform group-hover:scale-105">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-3.586l4.293 2.146A1 1 0 0021 16.67V7.33a1 1 0 00-1.407-.894L16 8.586V7a2 2 0 00-2-2H4z" />
                </svg>
              </div>
              <span className="text-base font-bold tracking-tight text-neutral-900 group-hover:text-blue-600 transition-colors">
                Video<span className="text-blue-600">Platform</span>
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 border-l border-neutral-200 pl-6 text-sm font-medium text-neutral-600">
              <Link href="/dashboard" className="rounded-lg px-3 py-1.5 hover:bg-neutral-100 hover:text-neutral-900 transition-colors">
                Sites
              </Link>
              {user.isSuperAdmin && (
                <Link href="/admin" className="rounded-lg px-3 py-1.5 text-blue-600 hover:bg-blue-50 transition-colors">
                  Platform Admin
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-full border border-neutral-200 bg-neutral-50/80 py-1 pl-1.5 pr-3 text-xs font-medium text-neutral-700">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 text-[10px] font-bold text-white shadow-xs">
                {initials}
              </span>
              <span className="hidden sm:inline-block max-w-[160px] truncate">{user.email}</span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
