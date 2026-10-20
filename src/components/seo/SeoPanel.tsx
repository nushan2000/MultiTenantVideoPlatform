"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnCls } from "@/components/ui";
import SearchListing, { type ListingProps, type ListingValue } from "./SearchListing";

type Props = Omit<ListingProps, "value" | "onChange" | "savedHandle"> & {
  initial: ListingValue;
  /** Builds the JSON body for the PATCH request from the edited value. */
  toBody: (v: ListingValue) => object;
  endpoint: string;
  /** Called with the server response after a successful save (e.g. to update a table row). */
  onSaved?: (response: any, v: ListingValue) => void;
  saveLabel?: string;
};

/** A SearchListing that saves itself (client-side fetch, no page reload) and refreshes server data (health score). */
export default function SeoPanel({ initial, toBody, endpoint, onSaved, saveLabel = "Save", ...listing }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  async function save() {
    setState({ kind: "saving" });
    const res = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(toBody(value)) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (res?.ok) {
      setSaved(value);
      setState({ kind: "ok", msg: "Saved" });
      onSaved?.(data, value);
      router.refresh();
    } else {
      setState({ kind: "error", msg: data?.issues?.[0]?.message ?? data?.error ?? "Could not save" });
    }
  }

  return (
    <div>
      <SearchListing {...listing} value={value} onChange={(v) => { setValue(v); setState({ kind: "idle" }); }} savedHandle={saved.handle} />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className={btnCls} disabled={!dirty || state.kind === "saving"} onClick={save}>{state.kind === "saving" ? "Saving…" : saveLabel}</button>
        {state.kind === "ok" && !dirty && <span role="status" className="text-sm text-green-700">{state.msg}</span>}
        {state.kind === "error" && <span role="alert" className="text-sm text-red-700">{state.msg}</span>}
        {dirty && state.kind === "idle" && <span className="text-xs text-neutral-500">Unsaved changes</span>}
      </div>
    </div>
  );
}
