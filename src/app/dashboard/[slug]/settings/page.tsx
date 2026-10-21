import { requireTenant } from "@/lib/access";
import Link from "next/link";
import { addCategoryAction, deleteCategoryAction, saveFeaturesAction, saveGeneralAction } from "../../actions";
import { Card, Field, Flash, btnCls, btnDangerCls, btnGhostCls, inputCls } from "@/components/ui";
import { parseFeatures } from "@/lib/theme";

export default async function Settings({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const features = parseFeatures(a.tenant.features);
  const categories = await a.db.category.findMany({ orderBy: { name: "asc" } });
  const adult = a.tenant.contentCategory === "ADULT";
  const toggles: [keyof typeof features, string, boolean][] = [
    ["categories", "Categories", false], ["search", "Search", false],
    ["comments", "Comments (visitors can comment on videos; you moderate them in the Comments tab)", false], ["likes", "Likes (a ♡ button on every video)", false],
    ["commentsAutoApprove", "Publish comments immediately (otherwise each comment waits for your approval)", false],
  ];
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />

      <Card title="Look & branding">
        <p className="text-sm text-neutral-700">
          Site name, template, logo, favicon, colours, fonts, layout and custom CSS are edited in one place with a live preview.
        </p>
        <Link href={`/dashboard/${slug}/customize`} className={`${btnCls} mt-3 inline-block`}>Open Customize →</Link>
      </Card>

      <Card title="Content type">
        <form action={saveGeneralAction.bind(null, slug)}>
          <input type="hidden" name="name" value={a.tenant.name} />
          <input type="hidden" name="template" value={a.tenant.templateId} />
          <Field label="Content type" hint="Adult sites always show an age-gate, carry RTA labels, and can't use ad networks that disallow adult content.">
            <select className={inputCls} name="contentCategory" defaultValue={a.tenant.contentCategory}><option value="GENERAL">General audience</option><option value="ADULT">Adult (18+)</option></select>
          </Field>
          <button className={btnCls}>Save</button>
        </form>
      </Card>

      <Card title="Features">
        <form action={saveFeaturesAction.bind(null, slug)}>
          {toggles.map(([k, label, disabled]) => (
            <label key={k} className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={features[k]} disabled={disabled} /> {label}</label>
          ))}
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name="ageGate" defaultChecked={adult || features.ageGate} disabled={adult} /> Age-gate interstitial {adult && "(required for adult sites)"}</label>
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name="noindex" defaultChecked={features.noindex} /> Ask search engines not to index this site (noindex)</label>
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name="crawlerAccess" defaultChecked={features.crawlerAccess} /> Let search engines read content behind the age gate (recommended: gated sites cannot be indexed otherwise)</label>
          <button className={btnCls}>Save features</button>
        </form>
      </Card>

      <Card title="Categories">
        <ul className="mb-3 space-y-1 text-sm">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between"><span>{c.name} <a className="ml-2 text-xs text-blue-700 underline" href={`/dashboard/${slug}/seo#category-${c.id}`}>Edit SEO &amp; URL →</a></span>
              <form action={deleteCategoryAction.bind(null, slug, c.id)}><button className={btnDangerCls}>Delete</button></form></li>
          ))}
          {categories.length === 0 && <li className="text-neutral-500">No categories yet.</li>}
        </ul>
        <form action={addCategoryAction.bind(null, slug)} className="flex gap-2"><input className={inputCls} name="name" placeholder="New category" maxLength={40} required /><button className={btnGhostCls}>Add</button></form>
      </Card>
    </>
  );
}
