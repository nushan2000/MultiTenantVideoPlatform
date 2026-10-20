"use client";

import { useEffect, useState } from "react";
import { Card, Field, btnCls, btnGhostCls, inputCls } from "@/components/ui";

type Props = {
  action: (fd: FormData) => void | Promise<void>;
  templates: { id: string; name: string }[];
  presets: { key: string; label: string; primary: string; bg: string }[];
};

const steps = ["Details", "Look & feel", "Features"];

export default function Wizard({ action, templates, presets }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [avail, setAvail] = useState<{ available: boolean; reason?: string } | null>(null);
  const [adult, setAdult] = useState(false);

  useEffect(() => {
    if (!slugTouched) setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30));
  }, [name, slugTouched]);

  // live slug availability check (debounced)
  useEffect(() => {
    setAvail(null);
    if (slug.length < 3) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/sites/slug-available?slug=${encodeURIComponent(slug)}`).catch(() => null);
      if (r?.ok) setAvail(await r.json());
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  const slugMsg = avail === null ? (slug.length >= 3 ? "Checking…" : "") : avail.available ? "✓ Available" : avail.reason === "reserved" ? "This name is reserved" : avail.reason === "format" ? "Use 3-30 lowercase letters, digits or hyphens" : "Already taken";
  const canNext = step === 0 ? name.trim().length >= 2 && avail?.available === true : true;

  return (
    <form action={action}>
      <ol className="mb-4 flex gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 ${i === step ? "bg-blue-600 text-white" : "bg-neutral-200"}`}>{i + 1}. {s}</li>
        ))}
      </ol>

      {/* All steps stay mounted (hidden) so every field is submitted. */}
      <div hidden={step !== 0}>
        <Card>
          <Field label="Site name"><input className={inputCls} name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></Field>
          <Field label="Address" hint={slugMsg}>
            <div className="flex items-center gap-1">
              <input className={inputCls} name="slug" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} maxLength={30} required />
              <span className="text-sm text-neutral-500">.yourplatform</span>
            </div>
          </Field>
          <Field label="Template">
            <select name="template" className={inputCls}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </Field>
          <Field label="Content type" hint="Adult sites are age-gated and labelled automatically. Adult content requires extra legal review before launch.">
            <select name="contentCategory" className={inputCls} onChange={(e) => setAdult(e.target.value === "ADULT")}>
              <option value="GENERAL">General audience</option>
              <option value="ADULT">Adult (18+)</option>
            </select>
          </Field>
        </Card>
      </div>

      <div hidden={step !== 1}>
        <Card>
          <Field label="Logo (PNG, JPEG or WebP, up to 1 MB)"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="text-sm" /></Field>
          <fieldset className="mb-3">
            <legend className="mb-1 text-sm font-medium">Colour theme</legend>
            <div className="flex flex-wrap gap-3">
              {presets.map((p, i) => (
                <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input type="radio" name="preset" value={p.key} defaultChecked={i === 0} />
                  <span className="inline-block h-4 w-4 rounded-full border" style={{ background: p.primary }} />
                  <span className="inline-block h-4 w-4 rounded-full border" style={{ background: p.bg }} />
                  {p.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">Custom colours and fonts are available on Premium.</p>
          </fieldset>
          <Field label="Layout density">
            <select name="density" className={inputCls} defaultValue="comfortable"><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select>
          </Field>
        </Card>
      </div>

      <div hidden={step !== 2}>
        <Card title="Features">
          {[["f_categories", "Categories", true], ["f_search", "Search", true], ["f_comments", "Comments (coming soon)", false], ["f_likes", "Likes (coming soon)", false]].map(([n, l, d]) => (
            <label key={n as string} className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name={n as string} defaultChecked={d as boolean} /> {l}</label>
          ))}
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name="f_ageGate" defaultChecked={adult} disabled={adult} /> Age-gate interstitial {adult && "(required for adult sites)"}</label>
        </Card>
      </div>

      <div className="flex gap-2">
        {step > 0 && <button type="button" className={btnGhostCls} onClick={() => setStep(step - 1)}>Back</button>}
        {step < 2 ? <button type="button" className={btnCls} disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button> : <button className={btnCls}>Create site</button>}
      </div>
    </form>
  );
}
