"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Field, btnCls, inputCls } from "@/components/ui";

export type ProfileValues = {
  legalName: string; contactEmail: string; contactAddress: string; country: string; responseTime: string;
  dmcaAgentName: string; dmcaAgentEmail: string; dmcaAgentAddress: string; custodianName: string; custodianAddress: string;
};

/** The facts the generated Privacy / Terms / Contact / DMCA / 2257 pages are written from. Saved client-side. */
export default function BusinessDetails({ tenantId, initial, adult }: { tenantId: string; initial: ProfileValues; adult: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ProfileValues>) => { setV({ ...v, ...patch }); setMsg(null); };

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/sites/${tenantId}/profile`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(v) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    setMsg(res?.ok ? { ok: true, text: "Saved. Your pages are updated." } : { ok: false, text: data?.issues?.[0]?.message ?? data?.error ?? "Could not save" });
    if (res?.ok) router.refresh();
  }
  const f = (k: keyof ProfileValues, label: string, hint?: string, ph?: string) => (
    <Field label={label} hint={hint}><input className={inputCls} value={v[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<ProfileValues>)} placeholder={ph} /></Field>
  );
  const missing = [!v.contactEmail && "a contact email", adult && !v.custodianName && "a 2257 records custodian"].filter(Boolean);

  return (
    <Card title="Business details">
      <p className="mb-3 text-sm text-neutral-600">These details fill in your Privacy Policy, Terms, Contact, Copyright/DMCA{adult ? " and 2257" : ""} pages automatically.
        The generated text is a starting template, not legal advice: have it reviewed for your country{adult ? " (adult content has extra requirements)" : ""}.</p>
      {missing.length > 0 && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Add {missing.join(" and ")} so your legal pages are complete.</p>}
      <div className="grid gap-x-4 sm:grid-cols-2">
        {f("legalName", "Legal / company name", "Who operates the site", "Acme Media Ltd")}
        {f("contactEmail", "Contact email", "Shown on the Contact page and used for privacy requests", "support@example.com")}
        {f("country", "Country", "Used for governing law", "United States")}
        {f("responseTime", "Reply time", "e.g. within 2 business days", "within 2 business days")}
      </div>
      <Field label="Postal address (optional)"><input className={inputCls} value={v.contactAddress} onChange={(e) => set({ contactAddress: e.target.value })} placeholder="123 Main St, City, Country" /></Field>
      <h3 className="mb-2 mt-4 text-sm font-semibold">Copyright (DMCA) designated agent</h3>
      <div className="grid gap-x-4 sm:grid-cols-3">
        {f("dmcaAgentName", "Agent name")}{f("dmcaAgentEmail", "Agent email")}{f("dmcaAgentAddress", "Agent address")}
      </div>
      {adult && (
        <>
          <h3 className="mb-2 mt-4 text-sm font-semibold">18 U.S.C. 2257 records custodian</h3>
          <div className="grid gap-x-4 sm:grid-cols-2">{f("custodianName", "Custodian name")}{f("custodianAddress", "Custodian address")}</div>
        </>
      )}
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className={btnCls} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save business details"}</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </Card>
  );
}
