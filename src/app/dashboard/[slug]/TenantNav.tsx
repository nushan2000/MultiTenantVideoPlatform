"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  slug: string;
  name: string;
  siteUrl: string;
  planKey: string;
  logoUrl: string | null;
  role: string;
};

const TABS: { href: string; label: string; icon: (active: boolean) => ReactNode; badge?: string }[] = [
  {
    href: "",
    label: "Overview",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    href: "/videos",
    label: "Videos",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: "/customize",
    label: "Customize",
    badge: "Studio",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4 4 4 0 014-4 2 2 0 012 2v2a2 2 0 002 2 2 2 0 012-2 4 4 0 014 4 4 4 0 01-4 4H7z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    href: "/pages",
    label: "Pages",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: "/seo",
    label: "SEO",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    href: "/domains",
    label: "Domain",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    href: "/ads",
    label: "Ads",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    href: "/billing",
    label: "Plan & billing",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    href: "/reports",
    label: "Reports",
    icon: (active) => (
      <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
      </svg>
    ),
  },
];

export function TenantNav({ slug, name, siteUrl, planKey, logoUrl, role }: Props) {
  const pathname = usePathname();
  const basePath = `/dashboard/${slug}`;

  return (
    <div className="mb-8">
      {/* Site Header Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-1">
              <img src={logoUrl} alt={name} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-sm shadow-blue-500/20">
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-neutral-900">{name}</h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
                  planKey === "premium"
                    ? "bg-amber-100/90 text-amber-900 border border-amber-200"
                    : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                }`}
              >
                {planKey}
              </span>
              <span className="text-xs text-neutral-400 capitalize">• {role.toLowerCase()}</span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Domain:</span>
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-800">{siteUrl}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={siteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-xs transition-all hover:bg-neutral-50 hover:border-neutral-300 hover:text-neutral-900"
          >
            <span>Visit Storefront</span>
            <svg className="h-3.5 w-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>

      {/* Modern Horizontal Navigation Tabs */}
      <nav className="flex space-x-1 overflow-x-auto rounded-xl border border-neutral-200/80 bg-white p-1.5 shadow-xs scrollbar-none">
        {TABS.map((tab) => {
          const tabHref = `${basePath}${tab.href}`;
          const isActive = tab.href === "" ? pathname === basePath : pathname === tabHref || pathname?.startsWith(`${tabHref}/`);

          return (
            <Link
              key={tab.href}
              href={tabHref}
              className={`group flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-xs ring-1 ring-blue-500/20"
                  : "text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-900"
              }`}
            >
              {tab.icon(isActive)}
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${
                    isActive ? "bg-blue-600 text-white" : "bg-neutral-200 text-neutral-700 group-hover:bg-neutral-300"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
