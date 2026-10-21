"use client";

import { useState } from "react";

export type PublicComment = { id: string; authorName: string; body: string; createdAt: string };

const border = "1px solid color-mix(in srgb, var(--text) 18%, transparent)";
const field = { width: "100%", padding: ".5rem .65rem", border, borderRadius: "var(--radius)", background: "transparent", color: "inherit", font: "inherit" } as const;

/** Comment list + form. The list is server-rendered text (React escapes it); new comments wait for moderation unless the owner auto-approves. */
export default function Comments({ videoId, initial, total }: { videoId: string; initial: PublicComment[]; total: number }) {
  const [list, setList] = useState(initial);
  const [count, setCount] = useState(total);
  const [state, setState] = useState<"idle" | "sending" | "pending" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setState("sending");
    const res = await fetch("/api/public/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId, name: f.get("name"), body: f.get("body"), website: f.get("website") }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (res?.ok) {
      form.reset();
      if (data.comment) { setList((l) => [data.comment, ...l]); setCount((c) => c + 1); setState("idle"); }
      else { setState("pending"); setMessage("Thanks! Your comment will appear after it has been reviewed."); }
    } else {
      setState("error");
      setMessage(data?.issues?.[0]?.message ?? data?.error ?? "Could not post your comment");
    }
  }

  return (
    <section aria-labelledby="comments-h" style={{ marginTop: "1.5rem" }}>
      <h2 id="comments-h" style={{ fontSize: "1.1rem" }}>{count.toLocaleString("en-US")} comment{count === 1 ? "" : "s"}</h2>
      <form onSubmit={submit} style={{ display: "grid", gap: ".5rem", margin: ".75rem 0 1rem" }}>
        <input name="name" required maxLength={40} placeholder="Your name" aria-label="Your name" style={{ ...field, maxWidth: "20rem" }} />
        <textarea name="body" required minLength={2} maxLength={1000} rows={3} placeholder="Add a comment…" aria-label="Comment" style={field} />
        {/* honeypot: hidden from people, irresistible to bots */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        <div><button className="sf-btn" disabled={state === "sending"}>{state === "sending" ? "Posting…" : "Comment"}</button></div>
        {state === "pending" && <p role="status" className="sf-meta">{message}</p>}
        {state === "error" && <p role="alert" style={{ color: "#b91c1c" }}>{message}</p>}
      </form>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: ".9rem" }}>
        {list.map((c) => (
          <li key={c.id}>
            <div className="sf-meta"><strong>{c.authorName}</strong> · <time dateTime={c.createdAt}>{c.createdAt.slice(0, 10)}</time></div>
            <p style={{ margin: ".2rem 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
