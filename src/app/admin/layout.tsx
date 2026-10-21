import Link from "next/link";
import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/access";

const tabs = [["/admin", "Overview"], ["/admin/users", "Users"], ["/admin/sites", "Sites"], ["/admin/domains", "Domains"], ["/admin/ads", "Ads"]] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSuperAdmin();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex justify-between"><h1 className="text-2xl font-bold">Platform admin</h1><Link href="/dashboard" className="text-sm underline">Dashboard</Link></div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b text-sm">
        {tabs.map(([href, label]) => <Link key={href} href={href} className="rounded-t px-3 py-2 hover:bg-white">{label}</Link>)}
      </nav>
      {children}
    </main>
  );
}
