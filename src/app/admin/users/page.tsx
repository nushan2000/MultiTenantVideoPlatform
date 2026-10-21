import { requireSuperAdmin } from "@/lib/access";
import { platformDb } from "@/lib/db/client";
import { deleteUserAction, resetUserPasswordAction, setUserSuperAdminAction, setUserSuspendedAction } from "../actions";
import { Card, Flash, btnDangerCls, btnGhostCls, inputCls } from "@/components/ui";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Users", robots: { index: false, follow: false } };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  const sp = await searchParams;
  const me = await requireSuperAdmin();
  const q = sp.q?.trim();
  const users = await platformDb.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { memberships: { include: { tenant: { select: { slug: true } } } } },
  });
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <Card title={`Users (${users.length}${users.length === 200 ? "+" : ""})`}>
        <form className="mb-4 flex gap-2"><input className={inputCls} name="q" defaultValue={q} placeholder="Search by email or name" /><button className={btnGhostCls}>Search</button></form>
        <ul className="divide-y text-sm">
          {users.map((u) => {
            const self = u.id === me.id;
            return (
              <li key={u.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{u.email}</strong>
                  {u.name && <span className="text-neutral-500">{u.name}</span>}
                  {u.isSuperAdmin && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">super admin</span>}
                  {u.suspendedAt && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">suspended</span>}
                  {self && <span className="text-xs text-neutral-400">(you)</span>}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  Joined {u.createdAt.toISOString().slice(0, 10)} · {u.memberships.length ? u.memberships.map((m) => `${m.tenant.slug} (${m.role.toLowerCase()})`).join(", ") : "no sites"}
                </div>
                {!self && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <form action={setUserSuspendedAction.bind(null, u.id, !u.suspendedAt)}><button className={u.suspendedAt ? btnGhostCls : btnDangerCls}>{u.suspendedAt ? "Reinstate" : "Suspend"}</button></form>
                    <form action={setUserSuperAdminAction.bind(null, u.id, !u.isSuperAdmin)}><button className={btnGhostCls}>{u.isSuperAdmin ? "Remove super admin" : "Make super admin"}</button></form>
                    <form action={resetUserPasswordAction.bind(null, u.id)} className="flex gap-2">
                      <input className={`${inputCls} w-48`} type="password" name="password" minLength={10} placeholder="New password" autoComplete="new-password" required />
                      <button className={btnGhostCls}>Set password</button>
                    </form>
                    <form action={deleteUserAction.bind(null, u.id)}><button className={btnDangerCls}>Delete</button></form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
