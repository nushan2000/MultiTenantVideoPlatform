import Link from "next/link";
import { requireUser } from "@/lib/access";
import { platformDb } from "@/lib/db/client";
import { siteUrl } from "@/lib/site-url";
import { Card, Flash, btnCls } from "@/components/ui";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; suspended?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const memberships = await platformDb.membership.findMany({ where: { userId: user.id }, include: { tenant: { include: { plan: true } } }, orderBy: { tenant: { createdAt: "asc" } } });
  return (
    <>
      <Flash ok={sp.ok} error={sp.error ?? (sp.suspended ? "That site is suspended. Contact support." : undefined)} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your sites</h1>
        <Link href="/dashboard/new" className={btnCls}>Create a site</Link>
      </div>
      {memberships.length === 0 && <Card>You don&apos;t have a site yet. Create one in a minute.</Card>}
      {memberships.map((m) => (
        <Card key={m.id}>
          <div className="flex items-center justify-between">
            <div>
              <Link href={`/dashboard/${m.tenant.slug}`} className="font-semibold text-blue-700">{m.tenant.name}</Link>
              <div className="text-sm text-neutral-500">{siteUrl(m.tenant.slug)} · {m.tenant.plan.name} · {m.role.toLowerCase()}{m.tenant.status === "SUSPENDED" ? " · SUSPENDED" : ""}</div>
            </div>
            <Link href={`/dashboard/${m.tenant.slug}`} className="text-sm underline">Manage</Link>
          </div>
        </Card>
      ))}
    </>
  );
}
