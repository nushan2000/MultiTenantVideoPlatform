"use client";

import { useMemo, useState } from "react";
import { btnDangerCls, btnGhostCls } from "@/components/ui";

export type CommentRow = { id: string; author: string; body: string; status: "PENDING" | "APPROVED" | "HIDDEN"; createdAt: string; videoTitle: string };
type Filter = "PENDING" | "APPROVED" | "HIDDEN";

const tab = (on: boolean) => `rounded-full px-3 py-1 text-sm ${on ? "bg-blue-600 text-white" : "bg-neutral-200 hover:bg-neutral-300"}`;

export default function Moderation({ initial, canModerate }: { initial: CommentRow[]; canModerate: boolean }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<Filter>(initial.some((r) => r.status === "PENDING") ? "PENDING" : "APPROVED");
  const [error, setError] = useState<string | null>(null);
  const counts = useMemo(() => ({ PENDING: rows.filter((r) => r.status === "PENDING").length, APPROVED: rows.filter((r) => r.status === "APPROVED").length, HIDDEN: rows.filter((r) => r.status === "HIDDEN").length }), [rows]);

  async function setStatus(id: string, status: Filter) {
    setError(null);
    const res = await fetch(`/api/comments/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => null);
    if (res?.ok) setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
    else setError("Could not update the comment");
  }
  async function remove(id: string) {
    if (!confirm("Delete this comment permanently?")) return;
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setRows((r) => r.filter((x) => x.id !== id));
    else setError("Could not delete the comment");
  }

  const shown = rows.filter((r) => r.status === filter);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className={tab(filter === "PENDING")} onClick={() => setFilter("PENDING")}>Waiting ({counts.PENDING})</button>
        <button className={tab(filter === "APPROVED")} onClick={() => setFilter("APPROVED")}>Published ({counts.APPROVED})</button>
        <button className={tab(filter === "HIDDEN")} onClick={() => setFilter("HIDDEN")}>Hidden ({counts.HIDDEN})</button>
      </div>
      {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
      {shown.length === 0 && <p className="text-sm text-neutral-500">Nothing here.</p>}
      <ul className="divide-y">
        {shown.map((c) => (
          <li key={c.id} className="py-3">
            <div className="text-xs text-neutral-500"><strong className="text-neutral-800">{c.author}</strong> on “{c.videoTitle}” · {c.createdAt.slice(0, 16).replace("T", " ")}</div>
            <p className="my-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
            {canModerate && (
              <div className="flex gap-2">
                {c.status !== "APPROVED" && <button className={btnGhostCls} onClick={() => setStatus(c.id, "APPROVED")}>Approve</button>}
                {c.status !== "HIDDEN" && <button className={btnGhostCls} onClick={() => setStatus(c.id, "HIDDEN")}>Hide</button>}
                <button className={btnDangerCls} onClick={() => remove(c.id)}>Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
