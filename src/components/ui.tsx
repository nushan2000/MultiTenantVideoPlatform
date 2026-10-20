import type { ReactNode } from "react";

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div role={error ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2 text-sm ${error ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"}`}>
      {error ?? ok}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-6 rounded-lg border border-neutral-200 bg-white p-5 ${className}`}>
      {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export const inputCls = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
export const btnCls = "inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
export const btnGhostCls = "inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50";
export const btnDangerCls = "inline-flex items-center rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Locked({ children }: { children: ReactNode }) {
  return <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{children}</p>;
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
