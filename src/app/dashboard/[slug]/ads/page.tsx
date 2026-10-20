import Link from "next/link";
import { requireTenant } from "@/lib/access";
import { saveAdsAction } from "../../actions";
import { Card, Field, Flash, Locked, btnCls, inputCls } from "@/components/ui";

export default async function Ads({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const cfg = await a.db.adConfig.findFirst();
  const adult = a.tenant.contentCategory === "ADULT";
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />
      {!a.ent.canControlAds ? (
        <Locked>
          Free sites show the platform&apos;s ads. They can&apos;t be changed or disabled. <Link className="underline" href={`/dashboard/${slug}/billing`}>Upgrade to Premium</Link> to use your own ads or turn them off.
        </Locked>
      ) : (
        <Card title="Ad settings">
          <form action={saveAdsAction.bind(null, slug)}>
            <Field label="Ads">
              <select className={inputCls} name="mode" defaultValue={cfg?.mode ?? "PLATFORM"}>
                <option value="PLATFORM">Platform ads</option>
                <option value="CUSTOM">My own ads</option>
              </select>
            </Field>
            <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={cfg?.enabled ?? true} /> Show ads (applies to &quot;My own ads&quot;; untick to turn ads off)</label>
            <Field label="VAST tag URL (pre-roll)" hint={adult ? "Adult site: networks that disallow adult content are rejected." : "https:// only"}>
              <input className={inputCls} name="vastTagUrl" defaultValue={cfg?.vastTagUrl ?? ""} placeholder="https://ads.example.com/vast.xml" />
            </Field>
            <Field label="Banner HTML snippet" hint="Sanitised: scripts are removed. Images, links and sandboxed https iframes are allowed.">
              <textarea className={`${inputCls} h-28 font-mono`} name="htmlSnippet" defaultValue={cfg?.htmlSnippet ?? ""} maxLength={10000} />
            </Field>
            <button className={btnCls}>Save ad settings</button>
          </form>
        </Card>
      )}
    </>
  );
}
