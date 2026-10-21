import type { ReactNode } from "react";

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-top-1 ${
        error
          ? "border-red-200 bg-red-50/90 text-red-900"
          : "border-emerald-200 bg-emerald-50/90 text-emerald-900"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {error ? (
          <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ) : (
          <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      <div className="flex-1 font-medium leading-relaxed">{error ?? ok}</div>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-6 rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm shadow-neutral-100 transition-all duration-200 hover:shadow-md hover:shadow-neutral-200/50 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between border-b border-neutral-100 pb-3">
          <h2 className="text-base font-semibold tracking-tight text-neutral-900">{title}</h2>
        </div>
      )}
      {children}
    </section>
  );
}

export const inputCls =
  "w-full rounded-xl border border-neutral-200/90 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs transition-all duration-150 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:bg-neutral-50 disabled:text-neutral-500";

export const btnCls =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition-all duration-150 hover:from-blue-500 hover:to-blue-600 hover:shadow-md hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-4 focus:ring-blue-500/20";

export const btnGhostCls =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200/90 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 shadow-xs transition-all duration-150 hover:bg-neutral-50 hover:border-neutral-300 hover:text-neutral-900 active:bg-neutral-100 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-4 focus:ring-neutral-200";

export const btnDangerCls =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/60 px-4 py-2.5 text-sm font-medium text-red-700 shadow-xs transition-all duration-150 hover:bg-red-100/80 hover:border-red-300 active:bg-red-200 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-4 focus:ring-red-500/15";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-4 block text-sm">
      <span className="mb-1.5 block font-medium text-neutral-800">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-neutral-500 leading-normal">{hint}</span>}
    </label>
  );
}

export function Locked({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/40 p-4 text-sm text-amber-900 shadow-xs">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <div className="flex-1 font-medium leading-relaxed">{children}</div>
    </div>
  );
}

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: "neutral" | "blue" | "emerald" | "amber" | "purple" | "rose";
  children: ReactNode;
}) {
  const styles = {
    neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${styles[variant]}`}>
      {children}
    </span>
  );
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

