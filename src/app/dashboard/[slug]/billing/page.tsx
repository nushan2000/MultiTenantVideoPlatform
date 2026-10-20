import { requireTenant } from "@/lib/access";
import { devSetPlanAction, startCheckoutAction } from "../../actions";
import { Card, Flash, btnCls, btnGhostCls, formatBytes } from "@/components/ui";
import { devBillingEnabled } from "@/lib/billing";
import { PLAN_CONFIG, type Entitlements } from "@/lib/entitlements";

const rows: [string, (e: Entitlements) => string][] = [
  ["Storage", (e) => formatBytes(e.storageLimitBytes)],
  ["Max quality", (e) => `${e.maxResolution}p`],
  ["Max upload size", (e) => formatBytes(e.maxUploadBytes)],
  ["Videos", (e) => (e.maxVideos === Infinity ? "Unlimited" : String(e.maxVideos))],
  ["URL import", (e) => (e.canUseUrlImport ? `${e.maxConcurrentImports} at once, ${e.maxImportBatch} per batch` : "No")],
  ["Custom domain", (e) => (e.canUseCustomDomain ? "Yes" : "No")],
  ["Your own ads", (e) => (e.canControlAds ? "Yes" : "No (platform ads)")],
  ["Custom theme & CSS", (e) => (e.canUseCustomCss ? "Yes" : "Presets only")],
  ["“Powered by” badge", (e) => (e.canRemoveBadge ? "Removed" : "Shown")],
];

export default async function Billing({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const isOwner = a.role === "OWNER";
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <Card title={`Current plan: ${a.planKey}`}>
        <table className="mb-4 w-full text-sm">
          <thead><tr className="text-left text-neutral-500"><th className="py-1"></th><th>Free</th><th>Premium</th></tr></thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-t"><td className="py-1.5">{label}</td><td>{f(PLAN_CONFIG.free)}</td><td>{f(PLAN_CONFIG.premium)}</td></tr>
            ))}
          </tbody>
        </table>
        {a.planKey === "free" && isOwner && (
          <form action={startCheckoutAction.bind(null, slug)}><button className={btnCls}>Upgrade to Premium</button></form>
        )}
        {a.planKey !== "free" && <p className="text-sm text-neutral-600">Manage or cancel your subscription from your payment provider&apos;s receipt email. Cancelling returns the site to the Free plan: your content is kept, custom domain is deactivated.</p>}
        {!isOwner && <p className="text-sm text-neutral-500">Only the site owner can change the plan.</p>}
      </Card>
      {devBillingEnabled() && isOwner && (
        <Card title="Development tools">
          <p className="mb-2 text-sm text-neutral-600">No Stripe keys are configured, so you can switch plans locally to test entitlements and downgrade rules.</p>
          <div className="flex gap-2">
            <form action={devSetPlanAction.bind(null, slug, "premium")}><button className={btnGhostCls}>Switch to Premium</button></form>
            <form action={devSetPlanAction.bind(null, slug, "free")}><button className={btnGhostCls}>Switch to Free</button></form>
          </div>
        </Card>
      )}
    </>
  );
}
