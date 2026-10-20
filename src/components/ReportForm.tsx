"use client";

import { useState } from "react";

export default function ReportForm({ videoId }: { videoId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    const res = await fetch("/api/public/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId, type: f.get("type"), reason: f.get("reason"), email: f.get("email") }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setState("done");
    else {
      setState("error");
      setMessage(data?.issues?.[0]?.message ?? data?.error ?? "Could not send the report");
    }
  }

  return (
    <details className="sf-report">
      <summary>Report this video</summary>
      {state === "done" ? (
        <p>Thank you. Our team will review your report.</p>
      ) : (
        <form onSubmit={submit}>
          <select name="type" defaultValue="ABUSE" aria-label="Report type">
            <option value="ABUSE">Abuse / inappropriate content</option>
            <option value="DMCA">Copyright (DMCA) notice</option>
          </select>
          <textarea name="reason" required minLength={10} maxLength={4000} rows={4} placeholder="What is wrong with this video?" />
          <input name="email" type="email" placeholder="Your email (required for copyright notices)" maxLength={200} />
          <button className="sf-btn" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Send report"}
          </button>
          {state === "error" && <p role="alert">{message}</p>}
        </form>
      )}
    </details>
  );
}
