import { requireSuperAdmin } from "@/lib/access";
import { platformDb } from "@/lib/db/client";
import { entitlements } from "@/lib/entitlements";
import { getEnv } from "@/lib/env";
import { adminSaveAdsAction } from "../actions";
import { Card, Field, Flash, btnCls, inputCls } from "@/components/ui";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Ads", robots: { index: false, follow: false } };

export default async function AdminAds({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const env = getEnv();
  const tenants = await platformDb.tenant.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { plan: true, adConfig: true } });
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      <Card title="Platform ads">
        <p className="mb-2 text-sm text-neutral-600">Shown on every free site and on premium sites using platform ads. Set in the server environment (<code>PLATFORM_VAST_TAG_URL</code>, <code>PLATFORM_ADULT_VAST_TAG_URL</code>).</p>
        <dl className="text-sm">
          <div className="flex gap-2"><dt className="w-24 text-neutral-500">General</dt><dd className="break-all">{env.PLATFORM_VAST_TAG_URL ?? "not set"}</dd></div>
          <div className="flex gap-2"><dt className="w-24 text-neutral-500">Adult</dt><dd className="break-all">{env.PLATFORM_ADULT_VAST_TAG_URL ?? "not set"}</dd></div>
        </dl>
      </Card>
      <Card title="Ads per site">
        <p className="mb-3 text-sm text-neutral-600">Free sites always show platform ads; a site&apos;s own ad settings only take effect on a plan that controls ads. Change the plan under Sites.</p>
        <ul className="divide-y text-sm">
          {tenants.map((t) => {
            const cfg = t.adConfig;
            const controls = entitlements(t.plan.key).canControlAds;
            const effective = !controls || !cfg || cfg.mode === "PLATFORM" ? "platform ads" : cfg.enabled ? "own ads" : "ads off";
            return (
              <li key={t.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2"><strong>{t.slug}</strong><span className="text-neutral-500">{t.plan.key} · {t.contentCategory.toLowerCase()}</span><span className="ml-auto rounded bg-neutral-200 px-1.5 py-0.5 text-xs">showing: {effective}</span></div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-blue-600">Edit ad settings</summary>
                  <form action={adminSaveAdsAction.bind(null, t.id)} className="mt-2">
                    <Field label="Ads">
                      <select className={inputCls} name="mode" defaultValue={cfg?.mode ?? "PLATFORM"}><option value="PLATFORM">Platform ads</option><option value="CUSTOM">Own ads</option></select>
                    </Field>
                    <label className="mb-3 flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={cfg?.enabled ?? true} /> Show ads (own ads only; untick to turn ads off)</label>
                    <Field label="VAST tag URL (pre-roll)"><input className={inputCls} name="vastTagUrl" defaultValue={cfg?.vastTagUrl ?? ""} placeholder="https://ads.example.com/vast.xml" /></Field>
                    <Field label="Banner HTML snippet"><textarea className={`${inputCls} h-24 font-mono`} name="htmlSnippet" defaultValue={cfg?.htmlSnippet ?? ""} maxLength={10000} /></Field>
                    <button className={btnCls}>Save</button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
