import Link from "next/link";
import { requireTenant } from "@/lib/access";
import { addDomainAction, removeDomainAction, verifyDomainAction } from "../../actions";
import { Card, Field, Flash, Locked, btnCls, btnDangerCls, btnGhostCls, inputCls } from "@/components/ui";
import { dnsInstructions } from "@/lib/domains";

const STATUS: Record<string, string> = {
  PENDING: "Waiting for DNS", VERIFIED: "DNS verified: issuing certificate", ACTIVE: "Live", FAILED: "Failed: DNS never verified",
};

export default async function Domains({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const domains = await a.db.customDomain.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      {!a.ent.canUseCustomDomain && (
        <Locked>
          Custom domains are a Premium feature. {domains.length > 0 && "Your domain is deactivated and your site is served from its free subdomain. "}
          <Link className="underline" href={`/dashboard/${slug}/billing`}>Upgrade</Link>
        </Locked>
      )}
      {a.ent.canUseCustomDomain && (
        <Card title="Connect a domain">
          <form action={addDomainAction.bind(null, slug)} className="flex gap-2">
            <input className={inputCls} name="hostname" placeholder="videos.example.com" required />
            <button className={btnCls}>Add</button>
          </form>
        </Card>
      )}
      {domains.map((d) => {
        const dns = dnsInstructions(d.hostname, d.verificationToken);
        return (
          <Card key={d.id} title={d.hostname}>
            <p className="mb-3 text-sm">Status: <strong>{STATUS[d.status]}</strong>{d.tlsStatus === "issued" && " · HTTPS active"}</p>
            {d.status !== "ACTIVE" && (
              <table className="mb-3 w-full text-left text-sm">
                <thead><tr className="text-neutral-500"><th className="py-1">Type</th><th>Name</th><th>Value</th></tr></thead>
                <tbody className="font-mono">
                  <tr><td>{dns.cname.type}</td><td>{dns.cname.name}</td><td>{dns.cname.value}</td></tr>
                  <tr><td>{dns.txt.type}</td><td>{dns.txt.name}</td><td>{dns.txt.value}</td></tr>
                </tbody>
              </table>
            )}
            <div className="flex gap-2">
              {a.ent.canUseCustomDomain && <form action={verifyDomainAction.bind(null, slug, d.id)}><button className={btnGhostCls}>Verify now</button></form>}
              <form action={removeDomainAction.bind(null, slug, d.id)}><button className={btnDangerCls}>Remove</button></form>
            </div>
          </Card>
        );
      })}
    </>
  );
}
