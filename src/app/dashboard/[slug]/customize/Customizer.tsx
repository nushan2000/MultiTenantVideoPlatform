"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Field, Locked, btnCls, btnGhostCls, inputCls } from "@/components/ui";
import {
  FONTS,
  THEME_PRESETS,
  checkThemeContrast,
  contrastRatio,
  presetTheme,
  validateCustomCss,
  type Theme,
} from "@/lib/theme";
import { getTemplate } from "@/templates/registry";
import type { StoreVideo } from "@/templates/types";
import { saveCustomizationAction, type CustomizeInput } from "../../actions";

type Props = {
  slug: string;
  templateId: string;
  templates: { id: string; name: string; description: string; defaults: { preset: string; density: Theme["density"] } }[];
  name: string;
  logoUrl: string | null;
  categoryNames: string[];
  theme: Theme;
  features: { search: boolean; categories: boolean };
  canUseCustomTheme: boolean;
  canUseCustomCss?: boolean;
  planKey?: string;
  siteUrl?: string;
  canEdit: boolean;
};

type TabId = "templates" | "identity" | "palette" | "typography" | "layout" | "header" | "css" | "review";

const TABS: { id: TabId; label: string; icon: string; hint: string; focus: string }[] = [
  { id: "templates", label: "Template", icon: "🎨", hint: "Choose storefront layout archetype", focus: ".sf-main" },
  { id: "identity", label: "Identity", icon: "🏷️", hint: "Brand name and logo assets", focus: ".sf-brand" },
  { id: "palette", label: "Colors", icon: "🌈", hint: "Brand accent, canvas, text & WCAG contrast", focus: ".sf" },
  { id: "typography", label: "Typography & Shape", icon: "🔤", hint: "Font family and corner radius", focus: ".sf-card" },
  { id: "layout", label: "Grid Density", icon: "📐", hint: "Video thumbnail density and sizing", focus: ".sf-grid" },
  { id: "header", label: "Header & Nav", icon: "🧭", hint: "Search bar, category chips, navigation", focus: ".sf-header, .sf-chips" },
  { id: "css", label: "Custom CSS", icon: "💻", hint: "Advanced custom styling rules (Premium)", focus: "" },
  { id: "review", label: "Review & Publish", icon: "🚀", hint: "Inspect visual diff and publish to live site", focus: "" },
];

const CURATED_PRESETS: { key: string; label: string; primary: string; bg: string; text: string; tag: string }[] = [
  { key: "classic", label: "Classic Slate", primary: "#2563eb", bg: "#ffffff", text: "#111827", tag: "Light" },
  { key: "midnight", label: "Midnight Cyber", primary: "#38bdf8", bg: "#0f172a", text: "#e5e7eb", tag: "Dark" },
  { key: "forest", label: "Emerald Clean", primary: "#15803d", bg: "#f7fdf9", text: "#14231a", tag: "Natural" },
  { key: "sunset", label: "Sunset Amber", primary: "#ea580c", bg: "#fff7ed", text: "#2b1608", tag: "Warm" },
  { key: "royal", label: "Royal Violet", primary: "#7c3aed", bg: "#faf5ff", text: "#1e1035", tag: "Vibrant" },
  { key: "obsidian", label: "Obsidian Neon", primary: "#06b6d4", bg: "#090d16", text: "#f1f5f9", tag: "High-Contrast" },
  { key: "crimson", label: "Crimson Noir", primary: "#e11d48", bg: "#0c0a09", text: "#fafaf9", tag: "Cinematic" },
  { key: "nordic", label: "Nordic Frost", primary: "#0284c7", bg: "#f8fafc", text: "#0f172a", tag: "Minimal" },
];

const CSS_SNIPPETS = [
  {
    title: "Frosted Glass Header",
    code: `.sf-header { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); background: rgba(255,255,255,0.75); border-bottom: 1px solid rgba(0,0,0,0.08); }`,
  },
  {
    title: "Card Hover Lift & Glow",
    code: `.sf-card { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }\n.sf-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px -10px rgba(0,0,0,0.15); }`,
  },
  {
    title: "Gradient Video Titles",
    code: `.sf-title { transition: color 0.15s ease; }\n.sf-card:hover .sf-title { color: var(--primary); }`,
  },
  {
    title: "Pill Shaped Category Chips",
    code: `.sf-chip { border-radius: 9999px !important; font-weight: 500; }`,
  },
];

const SAMPLE_TITLES = [
  "Mastering Next-Gen Video Transcoding in 2026",
  "Behind the Scenes: High-Throughput HLS Streaming Architecture",
  "Building Scalable Multi-Tenant Platforms with RLS",
  "Complete Video SEO: Sitemaps, JSON-LD & OpenGraph",
  "Adaptive Bitrate Streaming & Worker Queues Explained",
  "Studio Vlog: Customizing Storefront Themes Live",
  "The Future of White-Label Media Infrastructure",
  "Community Highlights & Top Streaming Showcases",
];

function generateThumbnailSvg(index: number, primaryColor: string): string {
  const hues = [220, 260, 190, 330, 140, 25, 45, 280];
  const h = hues[index % hues.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="bg-${index}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${h}, 45%, 18%)" />
        <stop offset="100%" stop-color="hsl(${h + 30}, 60%, 10%)" />
      </linearGradient>
      <linearGradient id="accent-${index}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.8" />
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.2" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg-${index})" />
    <circle cx="560" cy="80" r="140" fill="url(#accent-${index})" filter="blur(40px)" />
    <circle cx="80" cy="280" r="100" fill="hsl(${h}, 70%, 50%)" opacity="0.15" filter="blur(30px)" />
    <!-- Play symbol badge -->
    <rect x="270" y="130" width="100" height="100" rx="28" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
    <polygon points="312,165 342,180 312,195" fill="#ffffff" />
    <text x="32" y="320" fill="rgba(255,255,255,0.9)" font-family="system-ui, sans-serif" font-weight="700" font-size="20">0${index + 1} • HD STREAM</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type Draft = Omit<CustomizeInput, "radius"> & { radius: number; customCss: string };

export function Customizer(p: Props) {
  const initial = useMemo<Draft>(() => {
    const matchedPreset =
      Object.entries(THEME_PRESETS).find(([, v]) => v.theme.primaryColor === p.theme.primaryColor)?.[0] ?? "classic";

    return {
      name: p.name,
      template: p.templateId,
      preset: matchedPreset,
      primaryColor: p.theme.primaryColor,
      bgColor: p.theme.bgColor,
      textColor: p.theme.textColor,
      font: p.theme.font,
      radius: p.theme.radius,
      density: p.theme.density,
      search: p.features.search,
      categories: p.features.categories,
      customCss: p.theme.customCss || "",
    };
  }, [p.name, p.templateId, p.theme, p.features]);

  const [d, setD] = useState<Draft>(initial);
  const [activeTab, setActiveTab] = useState<TabId>("templates");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewPage, setPreviewPage] = useState<"home" | "watch" | "categories">("home");
  const [zoom, setZoom] = useState<100 | 85 | 75>(100);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setMsg(null);
  };

  // Keyboard shortcut: Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (canSave) save();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Calculate live theme tokens
  const theme: Theme = useMemo(() => {
    const base = p.canUseCustomTheme
      ? {
          primaryColor: d.primaryColor,
          bgColor: d.bgColor,
          textColor: d.textColor,
          font: d.font as Theme["font"],
          radius: d.radius,
        }
      : presetTheme(d.preset);

    return {
      ...base,
      density: d.density as Theme["density"],
      customCss: p.canUseCustomCss ? d.customCss : "",
    };
  }, [d, p.canUseCustomTheme, p.canUseCustomCss]);

  // Contrast & Accessibility Check
  const contrastError = p.canUseCustomTheme ? checkThemeContrast(theme) : null;
  const textContrast = contrastRatio(theme.textColor, theme.bgColor);
  const primaryContrast = contrastRatio(theme.primaryColor, theme.bgColor);

  // CSS Validation
  const cssValidation: { ok: true } | { ok: false; reason: string } = useMemo(() => {
    if (!d.customCss.trim()) return { ok: true };
    return validateCustomCss(d.customCss);
  }, [d.customCss]);

  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const canSave = dirty && !saving && p.canEdit && !contrastError && (cssValidation.ok || !p.canUseCustomCss);

  const Template = getTemplate(d.template);
  const currentTab = TABS.find((t) => t.id === activeTab) || TABS[0];

  function pickTemplate(id: string) {
    const t = p.templates.find((x) => x.id === id);
    if (!t) return;
    const pr = THEME_PRESETS[t.defaults.preset]?.theme;
    setD((x) => ({
      ...x,
      template: id,
      preset: t.defaults.preset,
      density: t.defaults.density,
      ...(pr ? { primaryColor: pr.primaryColor!, bgColor: pr.bgColor!, textColor: pr.textColor! } : {}),
    }));
    setMsg(null);
  }

  function applyPreset(preset: typeof CURATED_PRESETS[0]) {
    setD((x) => ({
      ...x,
      preset: preset.key,
      primaryColor: preset.primary,
      bgColor: preset.bg,
      textColor: preset.text,
    }));
    setMsg(null);
  }

  function handleReset() {
    if (confirm("Discard all unsaved edits and restore initial settings?")) {
      setD(initial);
      setMsg(null);
    }
  }

  const catList = p.categoryNames.length ? p.categoryNames : ["Technology", "Production", "Architecture", "Design", "Tutorials"];
  const chips = d.categories ? catList.map((c) => ({ title: c, href: "#" })) : [];

  const videos: StoreVideo[] = useMemo(
    () =>
      SAMPLE_TITLES.map((title, i) => ({
        id: `sample-${i}`,
        href: "#",
        title,
        description:
          i === 0
            ? "In this deep-dive walkthrough, we explore modern video delivery pipelines, multi-resolution adaptive streaming, and high-performance tenant storefronts."
            : null,
        thumbUrl: generateThumbnailSvg(i, d.primaryColor),
        durationSec: 240 + i * 165,
        views: 2400 + i * 4820,
        createdAt: new Date(Date.UTC(2026, 8, 28 - i * 3)),
        categoryName: catList[i % catList.length],
      })),
    [catList, d.primaryColor]
  );

  const features = {
    comments: false,
    categories: d.categories,
    search: d.search,
    likes: false,
    ageGate: false,
    downloads: false,
    noindex: false,
    crawlerAccess: true,
  };

  function save() {
    startSave(async () => {
      const res = await saveCustomizationAction(p.slug, {
        name: d.name,
        template: d.template,
        preset: d.preset,
        primaryColor: d.primaryColor,
        bgColor: d.bgColor,
        textColor: d.textColor,
        font: d.font,
        radius: d.radius,
        density: d.density,
        search: d.search,
        categories: d.categories,
        customCss: p.canUseCustomCss ? d.customCss : undefined,
      });
      setMsg(
        res.ok
          ? { ok: true, text: "All changes published successfully to your live storefront." }
          : { ok: false, text: res.error }
      );
    });
  }

  // Count modified attributes
  const modifiedCount = useMemo(() => {
    let count = 0;
    if (d.name !== initial.name) count++;
    if (d.template !== initial.template) count++;
    if (d.preset !== initial.preset) count++;
    if (d.primaryColor !== initial.primaryColor) count++;
    if (d.bgColor !== initial.bgColor) count++;
    if (d.textColor !== initial.textColor) count++;
    if (d.font !== initial.font) count++;
    if (d.radius !== initial.radius) count++;
    if (d.density !== initial.density) count++;
    if (d.search !== initial.search) count++;
    if (d.categories !== initial.categories) count++;
    if (d.customCss !== initial.customCss) count++;
    return count;
  }, [d, initial]);

  return (
    <div className="space-y-4">
      {/* Studio Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200/90 bg-white p-3.5 sm:px-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xs">
            <span className="text-base">🎨</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-neutral-900 sm:text-base">Storefront Design Studio</h2>
              {dirty ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {modifiedCount} unsaved {modifiedCount === 1 ? "change" : "changes"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Synced with live
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 hidden sm:block">
              {p.name} • {Template.name} • {d.density} layout
            </p>
          </div>
        </div>

        {/* Viewport & Page Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* Device switch */}
          <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-100/70 p-1">
            {(
              [
                { id: "desktop", label: "Desktop", icon: "🖥️" },
                { id: "tablet", label: "Tablet", icon: "💻" },
                { id: "mobile", label: "Mobile", icon: "📱" },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setDevice(v.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  device === v.id ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600 hover:text-neutral-900"
                }`}
                title={`Switch to ${v.label} preview`}
              >
                <span>{v.icon}</span>
                <span className="hidden md:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* Page switch */}
          <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-100/70 p-1">
            {(
              [
                { id: "home", label: "Home" },
                { id: "watch", label: "Watch" },
                { id: "categories", label: "Categories" },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setPreviewPage(v.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  previewPage === v.id ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition-colors"
                title="Discard unsaved changes"
              >
                Reset
              </button>
            )}

            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className={`${btnCls} py-2 text-xs`}
            >
              {saving ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Publishing…</span>
                </>
              ) : (
                <>
                  <span>Save & Publish</span>
                  <span className="hidden lg:inline rounded bg-blue-500/30 px-1 py-0.2 text-[10px] font-mono">⌘S</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border p-3.5 text-xs font-medium shadow-xs transition-all ${
            msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{msg.ok ? "✓" : "⚠️"}</span>
            <span>{msg.text}</span>
          </div>
          <button type="button" onClick={() => setMsg(null)} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
      )}

      {/* Main Studio Grid: Left Control Center (tabs + panels), Right Live Stage */}
      <div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)] items-start">
        {/* --------------------------------- Left Controls Pane --------------------------------- */}
        <div className="rounded-2xl border border-neutral-200/90 bg-white shadow-xs overflow-hidden">
          {/* Navigation Category Bar */}
          <div className="grid grid-cols-4 gap-1 border-b border-neutral-200/80 bg-neutral-50/70 p-2 sm:grid-cols-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center rounded-xl p-2 text-center transition-all ${
                  activeTab === tab.id
                    ? "bg-white text-blue-700 shadow-xs ring-1 ring-blue-600/20 font-semibold"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 text-xs font-medium"
                }`}
              >
                <span className="text-base mb-0.5">{tab.icon}</span>
                <span className="text-[11px] leading-tight line-clamp-1">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Header Banner */}
          <div className="border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white px-5 py-3.5">
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span>{currentTab.icon}</span>
              <span>{currentTab.label}</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">{currentTab.hint}</p>
          </div>

          {/* Active Tab Form Content */}
          <div className="p-5 space-y-5 max-h-[68vh] overflow-y-auto">
            {/* 1. TEMPLATES */}
            {activeTab === "templates" && (
              <div className="space-y-4">
                <Field label="Storefront Theme" hint="Choose a visual layout archetype. Switching resets to template defaults while keeping content.">
                  <div className="grid gap-3">
                    {p.templates.map((t) => {
                      const isSelected = d.template === t.id;
                      return (
                        <label
                          key={t.id}
                          className={`relative flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-all ${
                            isSelected
                              ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/10 shadow-xs"
                              : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="template"
                            className="mt-1 accent-blue-600"
                            checked={isSelected}
                            onChange={() => pickTemplate(t.id)}
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-neutral-900">{t.name}</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 bg-neutral-100 rounded-md px-2 py-0.5">
                                {t.defaults.preset}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-neutral-600 leading-relaxed">{t.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </Field>

                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 text-xs text-blue-900 leading-relaxed">
                  💡 <strong>Tip:</strong> Templates provide distinct layout compositions. <em>Classic grid</em> offers a broad feed layout, while <em>Dark compact</em> gives an immersive, dense dark-first feel.
                </div>
              </div>
            )}

            {/* 2. IDENTITY */}
            {activeTab === "identity" && (
              <div className="space-y-5">
                <Field label="Site Brand Name" hint="Shown in storefront header, browser tab, metadata, and video player.">
                  <div className="relative">
                    <input
                      className={inputCls}
                      value={d.name}
                      maxLength={60}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="e.g. Acme Studio"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-neutral-400 font-mono">
                      {d.name.length}/60
                    </span>
                  </div>
                </Field>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-neutral-700">Logo & Branding Asset</span>
                    <Link
                      href={`/dashboard/${p.slug}/settings`}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Manage in Settings →
                    </Link>
                  </div>

                  <div className="flex items-center gap-3.5 rounded-lg border border-neutral-200/80 bg-white p-3">
                    {p.logoUrl ? (
                      <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md border border-neutral-100 bg-neutral-50 p-1">
                        <img src={p.logoUrl} alt="Logo preview" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-base">
                        {d.name.slice(0, 2).toUpperCase() || "VP"}
                      </div>
                    )}
                    <div className="text-xs text-neutral-600 leading-normal">
                      {p.logoUrl ? (
                        <span>Custom logo is active and displayed in the live preview.</span>
                      ) : (
                        <span>No custom logo uploaded yet. An SVG monogram is automatically rendered.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. PALETTE & CONTRAST */}
            {activeTab === "palette" && (
              <div className="space-y-5">
                {/* 1-Click Curated Designer Palettes */}
                <div>
                  <label className="block text-xs font-bold text-neutral-800 mb-2">
                    Curated Harmonious Presets (1-Click)
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                    {CURATED_PRESETS.map((cp) => (
                      <button
                        key={cp.key}
                        type="button"
                        onClick={() => applyPreset(cp)}
                        className={`group flex items-center justify-between rounded-xl border p-2.5 text-left transition-all ${
                          d.primaryColor === cp.primary && d.bgColor === cp.bg
                            ? "border-blue-600 bg-blue-50/80 ring-2 ring-blue-600/10 shadow-xs"
                            : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="h-6 w-6 rounded-lg border border-neutral-300 shadow-xs flex items-center justify-center"
                            style={{ background: cp.bg }}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: cp.primary }} />
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-neutral-800">{cp.label}</span>
                            <span className="block text-[10px] text-neutral-500">{cp.tag}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {p.canUseCustomTheme ? (
                  <>
                    <div className="border-t border-neutral-100 pt-4">
                      <span className="block text-xs font-bold text-neutral-800 mb-3">Custom Color Specifications</span>
                      <div className="grid grid-cols-3 gap-2.5">
                        <Field label="Brand Accent" hint="Buttons, badges, highlights">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              className="h-9 w-10 cursor-pointer rounded-lg border border-neutral-200 bg-transparent p-0.5"
                              value={d.primaryColor}
                              onChange={(e) => set("primaryColor", e.target.value)}
                            />
                            <input
                              type="text"
                              className="w-full font-mono text-xs uppercase rounded-lg border border-neutral-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none"
                              value={d.primaryColor}
                              maxLength={7}
                              onChange={(e) => set("primaryColor", e.target.value)}
                            />
                          </div>
                        </Field>

                        <Field label="Canvas Background" hint="Page backdrop">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              className="h-9 w-10 cursor-pointer rounded-lg border border-neutral-200 bg-transparent p-0.5"
                              value={d.bgColor}
                              onChange={(e) => set("bgColor", e.target.value)}
                            />
                            <input
                              type="text"
                              className="w-full font-mono text-xs uppercase rounded-lg border border-neutral-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none"
                              value={d.bgColor}
                              maxLength={7}
                              onChange={(e) => set("bgColor", e.target.value)}
                            />
                          </div>
                        </Field>

                        <Field label="Text / Body" hint="Titles, paragraphs">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              className="h-9 w-10 cursor-pointer rounded-lg border border-neutral-200 bg-transparent p-0.5"
                              value={d.textColor}
                              onChange={(e) => set("textColor", e.target.value)}
                            />
                            <input
                              type="text"
                              className="w-full font-mono text-xs uppercase rounded-lg border border-neutral-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none"
                              value={d.textColor}
                              maxLength={7}
                              onChange={(e) => set("textColor", e.target.value)}
                            />
                          </div>
                        </Field>
                      </div>
                    </div>

                    {/* WCAG 2.1 Contrast Rating Card */}
                    <div
                      className={`rounded-xl border p-4 shadow-xs transition-all ${
                        contrastError
                          ? "border-red-300 bg-red-50/70 text-red-900"
                          : textContrast >= 7
                          ? "border-emerald-300 bg-emerald-50/70 text-emerald-950"
                          : "border-blue-300 bg-blue-50/70 text-blue-950"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <span>{contrastError ? "⚠️" : "🛡️"}</span>
                          <span>WCAG 2.1 Contrast Rating</span>
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                            contrastError
                              ? "bg-red-200 text-red-800"
                              : textContrast >= 7
                              ? "bg-emerald-200 text-emerald-900"
                              : "bg-blue-200 text-blue-900"
                          }`}
                        >
                          {contrastError ? "Fails AA" : textContrast >= 7 ? "AAA Passed" : "AA Passed"}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between font-medium">
                          <span>Text vs Canvas:</span>
                          <span className="font-mono font-bold">{textContrast.toFixed(1)}:1 (Min 4.5:1)</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Brand Accent vs Canvas:</span>
                          <span className="font-mono font-bold">{primaryContrast.toFixed(1)}:1 (Min 3.0:1)</span>
                        </div>
                      </div>

                      {contrastError && (
                        <p className="mt-2.5 text-xs text-red-800 font-medium leading-relaxed bg-white/70 p-2 rounded-lg border border-red-200">
                          {contrastError} Please increase contrast between colors before publishing.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <Locked>
                      Custom hex color pickers and accessibility tuning are Premium features. Pick any of the curated presets above, or upgrade your plan.
                    </Locked>
                  </div>
                )}
              </div>
            )}

            {/* 4. TYPOGRAPHY & SHAPE */}
            {activeTab === "typography" && (
              <div className="space-y-5">
                {p.canUseCustomTheme ? (
                  <>
                    <Field label="Typography Family" hint="Sets the primary typeface across headers, cards, and metadata.">
                      <div className="grid grid-cols-2 gap-2.5">
                        {(
                          [
                            { key: "system", name: "System Modern", sample: "Aa Modern Clean", fontCss: FONTS.system },
                            { key: "serif", name: "Editorial Serif", sample: "Aa Elegant Story", fontCss: FONTS.serif },
                            { key: "mono", name: "Tech Monospace", sample: "Aa Code & Studio", fontCss: FONTS.mono },
                            { key: "rounded", name: "Friendly Rounded", sample: "Aa Warm Approach", fontCss: FONTS.rounded },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => set("font", f.key)}
                            className={`rounded-xl border p-3 text-left transition-all ${
                              d.font === f.key
                                ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/10 shadow-xs"
                                : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                            }`}
                          >
                            <span className="block text-xs font-bold text-neutral-900">{f.name}</span>
                            <span
                              className="mt-1 block text-sm text-neutral-600"
                              style={{ fontFamily: f.fontCss }}
                            >
                              {f.sample}
                            </span>
                          </button>
                        ))}
                      </div>
                    </Field>

                    <div className="border-t border-neutral-100 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-neutral-800">
                          Card Corner Radius: <span className="font-mono text-blue-600">{d.radius}px</span>
                        </label>
                        <span className="text-[11px] text-neutral-500">
                          {d.radius === 0 ? "Sharp" : d.radius <= 6 ? "Subtle" : d.radius <= 14 ? "Modern" : "Pill"}
                        </span>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={24}
                        step={2}
                        value={d.radius}
                        className="w-full accent-blue-600 cursor-pointer"
                        onChange={(e) => set("radius", Number(e.target.value))}
                      />

                      {/* Quick Radius Chips */}
                      <div className="mt-3 flex items-center justify-between gap-1.5">
                        {[
                          { r: 0, label: "0px Sharp" },
                          { r: 6, label: "6px Subtle" },
                          { r: 10, label: "10px Modern" },
                          { r: 16, label: "16px Round" },
                          { r: 24, label: "24px Pill" },
                        ].map((chip) => (
                          <button
                            key={chip.r}
                            type="button"
                            onClick={() => set("radius", chip.r)}
                            className={`rounded-lg px-2 py-1 text-[11px] font-medium border transition-colors ${
                              d.radius === chip.r
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100"
                            }`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>

                      {/* Shape preview box */}
                      <div className="mt-4 flex items-center gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50 p-3">
                        <div
                          className="h-10 w-16 bg-blue-600 shadow-sm transition-all duration-200"
                          style={{ borderRadius: `${d.radius}px` }}
                        />
                        <span className="text-xs text-neutral-600 leading-tight">
                          Video thumbnails, buttons, and category chips inherit this exact corner curvature.
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <Locked>
                    Custom typography and corner curvature are part of the Premium theme engine. The template&apos;s standard font and shape are applied.
                  </Locked>
                )}
              </div>
            )}

            {/* 5. LAYOUT DENSITY */}
            {activeTab === "layout" && (
              <div className="space-y-4">
                <Field label="Grid Layout Density" hint="Controls spacing between video cards and minimum card size.">
                  <div className="grid gap-3">
                    {(
                      [
                        {
                          id: "compact",
                          name: "Compact Density",
                          min: "11rem",
                          gap: "0.75rem",
                          desc: "Tightly packed video feed. Shows the highest number of videos per screen.",
                          previewCols: "grid-cols-4",
                        },
                        {
                          id: "comfortable",
                          name: "Comfortable (Recommended)",
                          min: "15rem",
                          gap: "1.25rem",
                          desc: "Standard YouTube-style layout. Balanced typography, thumbnail clarity, and metadata.",
                          previewCols: "grid-cols-3",
                        },
                        {
                          id: "spacious",
                          name: "Spacious & Cinematic",
                          min: "19rem",
                          gap: "2.0rem",
                          desc: "Immersive wide thumbnail presentation with generous breathing room.",
                          previewCols: "grid-cols-2",
                        },
                      ] as const
                    ).map((item) => {
                      const isSelected = d.density === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => set("density", item.id)}
                          className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all ${
                            isSelected
                              ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/10 shadow-xs"
                              : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/50"
                          }`}
                        >
                          <div className="mt-0.5">
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-neutral-400 bg-white"
                              }`}
                            >
                              {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-neutral-900">{item.name}</span>
                              <span className="font-mono text-[11px] text-neutral-500">
                                Gap {item.gap}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-neutral-600 leading-relaxed">{item.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}

            {/* 6. HEADER & NAV */}
            {activeTab === "header" && (
              <div className="space-y-4">
                <span className="block text-xs font-bold text-neutral-800">Storefront Navigation Elements</span>

                <div className="space-y-3">
                  <label className="flex items-center justify-between rounded-xl border border-neutral-200 p-3.5 cursor-pointer hover:bg-neutral-50 transition-colors">
                    <div>
                      <span className="block text-sm font-semibold text-neutral-900">Show Global Search Bar</span>
                      <span className="block text-xs text-neutral-500">
                        Header search input allowing viewers to query video titles and descriptions.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={d.search}
                      onChange={(e) => set("search", e.target.checked)}
                      className="h-5 w-5 rounded border-neutral-300 text-blue-600 accent-blue-600"
                    />
                  </label>

                  <label className="flex items-center justify-between rounded-xl border border-neutral-200 p-3.5 cursor-pointer hover:bg-neutral-50 transition-colors">
                    <div>
                      <span className="block text-sm font-semibold text-neutral-900">Show Category Filter Chips</span>
                      <span className="block text-xs text-neutral-500">
                        Horizontal pill filter row on the homepage allowing quick category exploration.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={d.categories}
                      onChange={(e) => set("categories", e.target.checked)}
                      className="h-5 w-5 rounded border-neutral-300 text-blue-600 accent-blue-600"
                    />
                  </label>
                </div>

                {d.categories && (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5">
                    <span className="block text-xs font-semibold text-neutral-700 mb-2">Active Categories Filter Preview:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {catList.map((c) => (
                        <span key={c} className="rounded-full bg-white border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700 shadow-xs">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7. CUSTOM CSS (PREMIUM) */}
            {activeTab === "css" && (
              <div className="space-y-4">
                {p.canUseCustomCss ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-neutral-800">Tenant Custom CSS</label>
                        <span className={`text-[11px] font-mono ${d.customCss.length > 18000 ? "text-amber-600" : "text-neutral-400"}`}>
                          {d.customCss.length}/20,000 B
                        </span>
                      </div>
                      <textarea
                        value={d.customCss}
                        onChange={(e) => set("customCss", e.target.value)}
                        placeholder={`/* Write custom CSS overrides here */\n.sf-header { box-shadow: 0 4px 20px rgba(0,0,0,0.06); }`}
                        rows={7}
                        className="w-full rounded-xl border border-neutral-300 bg-neutral-900 p-3 font-mono text-xs text-emerald-400 placeholder:text-neutral-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    {/* CSS Validation alert */}
                    {!cssValidation.ok && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 font-medium">
                        ⚠️ <strong>Validation Error:</strong> {cssValidation.reason}
                      </div>
                    )}
                    {cssValidation.ok && d.customCss.trim().length > 0 && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                        <span>✓</span> <span>Valid syntax. Injected live into the preview.</span>
                      </div>
                    )}

                    {/* Pre-tested Snippets */}
                    <div className="border-t border-neutral-100 pt-3">
                      <span className="block text-xs font-bold text-neutral-800 mb-2">1-Click Style Snippets</span>
                      <div className="grid gap-2">
                        {CSS_SNIPPETS.map((snip) => (
                          <div key={snip.title} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
                            <span className="font-medium text-neutral-800">{snip.title}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const separator = d.customCss.trim() ? "\n\n" : "";
                                set("customCss", d.customCss + separator + snip.code);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-semibold text-xs"
                            >
                              + Insert
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <Locked>
                    Custom CSS stylesheet injection is a Premium plan feature. Upgrade your subscription in Plan & Billing to unlock full CSS control.
                  </Locked>
                )}
              </div>
            )}

            {/* 8. REVIEW & PUBLISH */}
            {activeTab === "review" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-3">Changes Summary</h4>
                  <ul className="space-y-2 text-xs">
                    <li className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                      <span className="text-neutral-500">Site Name:</span>
                      <span className="font-semibold text-neutral-900">{d.name}</span>
                    </li>
                    <li className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                      <span className="text-neutral-500">Template:</span>
                      <span className="font-semibold text-neutral-900">{Template.name}</span>
                    </li>
                    <li className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                      <span className="text-neutral-500">Preset / Theme:</span>
                      <span className="font-semibold text-neutral-900">
                        {p.canUseCustomTheme ? "Custom Palette" : THEME_PRESETS[d.preset]?.label || d.preset}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                      <span className="text-neutral-500">Density:</span>
                      <span className="font-semibold text-neutral-900 capitalize">{d.density}</span>
                    </li>
                    <li className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                      <span className="text-neutral-500">Typography:</span>
                      <span className="font-semibold text-neutral-900 capitalize">{d.font}</span>
                    </li>
                    <li className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                      <span className="text-neutral-500">Corner Radius:</span>
                      <span className="font-semibold text-neutral-900">{d.radius}px</span>
                    </li>
                    <li className="flex justify-between border-b border-neutral-200/60 pb-1.5">
                      <span className="text-neutral-500">Features:</span>
                      <span className="font-semibold text-neutral-900">
                        Search: {d.search ? "On" : "Off"} • Categories: {d.categories ? "On" : "Off"}
                      </span>
                    </li>
                    {p.canUseCustomCss && (
                      <li className="flex justify-between">
                        <span className="text-neutral-500">Custom CSS:</span>
                        <span className="font-semibold text-neutral-900">
                          {d.customCss.trim() ? `${d.customCss.length} bytes` : "None"}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>

                {!p.canEdit && (
                  <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 font-medium">
                    Only owners and admins have permission to save storefront changes.
                  </p>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={!canSave}
                    onClick={save}
                    className={`${btnCls} w-full py-3 text-sm`}
                  >
                    {saving ? "Publishing to Live Storefront…" : "Save & Publish Changes"}
                  </button>
                  {!dirty && !msg && (
                    <p className="mt-2 text-center text-xs text-neutral-400">
                      Storefront is up to date. Make edits above to publish.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stepper Footer Controls */}
          <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/70 p-3.5">
            <button
              type="button"
              className={btnGhostCls}
              disabled={activeTab === TABS[0].id}
              onClick={() => {
                const idx = TABS.findIndex((t) => t.id === activeTab);
                if (idx > 0) setActiveTab(TABS[idx - 1].id);
              }}
            >
              ← Back
            </button>

            <span className="text-xs text-neutral-400 font-medium">
              Step {TABS.findIndex((t) => t.id === activeTab) + 1} of {TABS.length}
            </span>

            {activeTab !== "review" ? (
              <button
                type="button"
                className={btnCls}
                onClick={() => {
                  const idx = TABS.findIndex((t) => t.id === activeTab);
                  if (idx < TABS.length - 1) setActiveTab(TABS[idx + 1].id);
                }}
              >
                Next →
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>

        {/* --------------------------------- Right Live Preview Stage --------------------------------- */}
        <div className="min-w-0 rounded-2xl bg-slate-900/95 p-3 sm:p-5 shadow-lg border border-slate-800 studio-canvas">
          {/* Simulated Browser Bar */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-500/80 inline-block" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/80 inline-block" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block" />
              </div>
              <div className="ml-2 hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-3 py-1 font-mono text-[11px] text-slate-300">
                <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>{p.siteUrl || `https://${p.slug}.videoplatform.com`}</span>
                <span className="text-slate-500">
                  {previewPage === "watch" ? "/v/sample-0" : previewPage === "categories" ? "/categories" : "/"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Zoom scale controls */}
              <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                <span>Zoom:</span>
                {[100, 85, 75].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoom(z as 100 | 85 | 75)}
                    className={`rounded px-1.5 py-0.5 hover:bg-slate-800 ${zoom === z ? "bg-slate-800 text-white font-bold" : ""}`}
                  >
                    {z}%
                  </button>
                ))}
              </div>

              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                Live Studio Stage
              </span>
            </div>
          </div>

          {/* Device Stage Frame */}
          <div className="overflow-auto py-2" style={{ maxHeight: "78vh" }}>
            <div
              className={`preview-frame mx-auto transition-all duration-300 ${
                device === "mobile"
                  ? "w-[390px] rounded-[44px] mobile-device-frame border-4 border-slate-800"
                  : device === "tablet"
                  ? "w-[768px] rounded-2xl border-2 border-slate-700 shadow-2xl"
                  : "w-full rounded-xl shadow-xl"
              }`}
              style={{
                transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
                transformOrigin: "top center",
                maxWidth: "100%",
              }}
              data-tab={activeTab}
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest("a,button,form")) {
                  e.preventDefault();
                }
              }}
              onSubmitCapture={(e) => e.preventDefault()}
            >
              {/* Mobile device top speaker notch simulation */}
              {device === "mobile" && (
                <div className="bg-slate-900 pt-3 pb-2 text-center select-none flex items-center justify-between px-6 text-white text-[10px] font-semibold">
                  <span>9:41</span>
                  <div className="h-4 w-20 rounded-full bg-black mx-auto" />
                  <span>5G 100%</span>
                </div>
              )}

              {/* Dynamic spotlight style tag */}
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                    .preview-frame .sf { min-height: 0; }
                    ${
                      currentTab.focus
                        ? `.preview-frame ${currentTab.focus
                            .split(",")
                            .map((s) => s.trim())
                            .join(`, .preview-frame `)} {
                            outline: 2px dashed #3b82f6 !important;
                            outline-offset: 4px !important;
                            border-radius: 6px;
                          }`
                        : ""
                    }
                  `,
                }}
              />

              {/* Render Selected Storefront Template Shell */}
              <Template.Shell
                tenant={{ name: d.name || "Your Site Name", logoUrl: p.logoUrl }}
                theme={theme}
                features={features}
                categories={catList.map((c) => ({ slug: c.toLowerCase(), name: c }))}
                navLinks={[
                  { title: "Home", href: "#" },
                  ...(d.categories ? [{ title: "Categories", href: "#" }] : []),
                ]}
                footer={[
                  { title: "Explore", links: [{ title: "Latest", href: "#" }, { title: "Featured", href: "#" }] },
                  { title: "Legal", links: [{ title: "Privacy", href: "#" }, { title: "Terms", href: "#" }] },
                ]}
                showBadge={false}
                allowCustomCss={p.canUseCustomCss ?? false}
              >
                {/* Home View */}
                {previewPage === "home" && (
                  <Template.Home
                    heading="Latest Releases"
                    intro="Explore curated multi-resolution video streaming powered by VideoPlatform."
                    chips={chips}
                    featured={videos.slice(0, 3)}
                    latest={videos.slice(3)}
                    features={features}
                  />
                )}

                {/* Watch View */}
                {previewPage === "watch" && (
                  <Template.Watch
                    video={videos[0]}
                    related={videos.slice(1, 5)}
                    breadcrumbs={[
                      { name: "Home", href: "#" },
                      { name: videos[0].categoryName || "Featured", href: "#" },
                      { name: videos[0].title, href: "#" },
                    ]}
                    player={
                      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black flex items-center justify-center shadow-lg group">
                        <img
                          src={videos[0].thumbUrl || ""}
                          alt={videos[0].title}
                          className="h-full w-full object-cover opacity-60"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                        <div className="absolute flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg transition-transform group-hover:scale-110">
                          <svg className="h-8 w-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-white/90">
                          <div className="flex items-center gap-2">
                            <span>04:12</span>
                            <span>/</span>
                            <span>09:35</span>
                          </div>
                          <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold">1080p HD</span>
                        </div>
                      </div>
                    }
                    actions={
                      <div className="flex items-center gap-2">
                        <span className="sf-chip cursor-pointer">👍 Like (1.2k)</span>
                        <span className="sf-chip cursor-pointer">🔗 Share</span>
                      </div>
                    }
                    report={<span className="text-xs text-neutral-400 mt-2 block">Flag abuse or DMCA</span>}
                    tags={[{ title: "Transcoding", href: "#" }, { title: "Streaming", href: "#" }, { title: "Production", href: "#" }]}
                    chapters={<div className="sf-meta mt-2 text-xs">Chapter 1: Overview • Chapter 2: Setup • Chapter 3: Deployment</div>}
                    transcript="Welcome to this comprehensive overview of our video platform infrastructure..."
                    features={features}
                  />
                )}

                {/* Categories View */}
                {previewPage === "categories" && (
                  <Template.Categories
                    categories={catList.map((c, i) => ({
                      name: c,
                      href: "#",
                      count: 14 + i * 8,
                      thumbUrl: generateThumbnailSvg(i, d.primaryColor),
                    }))}
                  />
                )}
              </Template.Shell>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
