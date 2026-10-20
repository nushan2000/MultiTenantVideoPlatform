import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/access";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-bold">VideoPlatform</Link>
          <div className="flex items-center gap-4 text-sm">
            {user.isSuperAdmin && <Link href="/admin" className="text-blue-600">Admin</Link>}
            <span className="text-neutral-500">{user.email}</span>
            <form action={logoutAction}><button className="underline">Sign out</button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
