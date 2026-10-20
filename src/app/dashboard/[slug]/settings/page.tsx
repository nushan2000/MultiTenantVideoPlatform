import { requireTenant } from "@/lib/access";
import { addCategoryAction, deleteCategoryAction, saveFeaturesAction, saveGeneralAction, saveThemeAction, uploadLogoAction } from "../../actions";
import { Card, Field, Flash, Locked, btnCls, btnDangerCls, btnGhostCls, inputCls } from "@/components/ui";
import { FONTS, THEME_PRESETS, parseFeatures, parseTheme } from "@/lib/theme";
import { listTemplates } from "@/templates/registry";

export default async function Settings({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await requireTenant(slug);
  const theme = parseTheme(a.tenant.theme);
  const features = parseFeatures(a.tenant.features);
  const categories = await a.db.category.findMany({ orderBy: { name: "asc" } });
  const adult = a.tenant.contentCategory === "ADULT";
  const toggles: [keyof typeof features, string, boolean][] = [
    ["categories", "Categories", false], ["search", "Search", false],
    ["comments", "Comments (not available yet)", true], ["likes", "Likes (not available yet)", true],
  ];
  return (
    <>
      <Flash ok={sp.ok} error={sp.error} />

      <Card title="General">
        <form action={saveGeneralAction.bind(null, slug)}>
          <Field label="Site name"><input className={inputCls} name="name" defaultValue={a.tenant.name} required maxLength={60} /></Field>
          <Field label="Template"><select className={inputCls} name="template" defaultValue={a.tenant.templateId}>{listTemplates().map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Content type" hint="Adult sites always show an age-gate, carry RTA labels, and can't use ad networks that disallow adult content.">
            <select className={inputCls} name="contentCategory" defaultValue={a.tenant.contentCategory}><option value="GENERAL">General audience</option><option value="ADULT">Adult (18+)</option></select>
          </Field>
          <button className={btnCls}>Save</button>
        </form>
      </Card>

      <Card title="Logo">
        {a.tenant.logoUrl && <img src={a.tenant.logoUrl} alt="Current logo" className="mb-3 h-12" />}
        <form action={uploadLogoAction.bind(null, slug)} className="flex items-center gap-3">
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="text-sm" required />
          <button className={btnGhostCls}>Upload</button>
        </form>
      </Card>

      <Card title="Theme">
        <form action={saveThemeAction.bind(null, slug)}>
          {a.ent.canUseCustomTheme ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Primary colour"><input type="color" name="primaryColor" defaultValue={theme.primaryColor} className="h-10 w-full" /></Field>
              <Field label="Background"><input type="color" name="bgColor" defaultValue={theme.bgColor} className="h-10 w-full" /></Field>
              <Field label="Text colour"><input type="color" name="textColor" defaultValue={theme.textColor} className="h-10 w-full" /></Field>
              <Field label="Font"><select className={inputCls} name="font" defaultValue={theme.font}>{Object.keys(FONTS).map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
              <Field label="Corner radius (px)"><input className={inputCls} type="number" name="radius" min={0} max={24} defaultValue={theme.radius} /></Field>
            </div>
          ) : (
            <>
              <Locked>Custom colours and fonts are a Premium feature. Pick a preset below.</Locked>
              <div className="mb-3 flex flex-wrap gap-3">
                {Object.entries(THEME_PRESETS).map(([key, p]) => (
                  <label key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <input type="radio" name="preset" value={key} defaultChecked={p.theme.primaryColor === theme.primaryColor} />
                    <span className="inline-block h-4 w-4 rounded-full border" style={{ background: p.theme.primaryColor }} />{p.label}
                  </label>
                ))}
              </div>
            </>
          )}
          <Field label="Layout density"><select className={inputCls} name="density" defaultValue={theme.density}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></Field>
          {a.ent.canUseCustomCss ? (
            <Field label="Custom CSS" hint="Scoped to your storefront. @import, scripts and non-https url() are rejected."><textarea className={`${inputCls} h-32 font-mono`} name="customCss" defaultValue={theme.customCss} maxLength={20000} /></Field>
          ) : (
            <Locked>Custom CSS is a Premium feature.</Locked>
          )}
          <button className={btnCls}>Save theme</button>
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
