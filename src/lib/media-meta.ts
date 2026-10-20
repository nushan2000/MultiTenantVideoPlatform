// Pure helpers for per-video text metadata: tags, chapters, captions, titles. Shared by server and dashboard.
import { slugifyHandle, stripText } from "./seo";

// ---------------------------------------------------------------- tags
export const tagSlug = (t: string) => slugifyHandle(t).slice(0, 40);
export const tagLabel = (slug: string) => slug.replace(/-/g, " ");

/** "Home Workout, yoga, yoga" -> ["home-workout","yoga"] (max 15). */
export function parseTags(input: string | string[]): string[] {
  const list = Array.isArray(input) ? input : input.split(/[,\n]/);
  return [...new Set(list.map(tagSlug).filter(Boolean))].slice(0, 15);
}

// ---------------------------------------------------------------- chapters ("key moments")
export type Chapter = { start: number; title: string };

const TS = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/;

/** Lines like "0:00 Intro" / "12:34 Topic" / "1:02:03 Outro" -> chapters sorted by time. */
export function parseChapters(text: string, durationSec?: number): Chapter[] {
  const out: Chapter[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = TS.exec(line);
    if (!m) continue;
    const start = (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]);
    if (durationSec && start >= durationSec) continue;
    const title = stripText(m[4]).slice(0, 100);
    if (title) out.push({ start, title });
  }
  const seen = new Set<number>();
  return out.sort((a, b) => a.start - b.start).filter((c) => (seen.has(c.start) ? false : (seen.add(c.start), true))).slice(0, 50);
}

export function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
export const formatChapters = (ch: Chapter[]) => ch.map((c) => `${formatTimestamp(c.start)} ${c.title}`).join("\n");

export function parseChaptersJson(v: unknown): Chapter[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is Chapter => !!c && typeof c.start === "number" && typeof c.title === "string")
    .map((c) => ({ start: Math.max(0, Math.floor(c.start)), title: stripText(c.title).slice(0, 100) }))
    .slice(0, 50);
}

// ---------------------------------------------------------------- captions
export type Caption = { lang: string; label: string; path: string };
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export function parseCaptionsJson(v: unknown): Caption[] {
  if (!Array.isArray(v)) return [];
  return v.filter((c): c is Caption => !!c && typeof c.lang === "string" && LANG_RE.test(c.lang) && typeof c.path === "string" && typeof c.label === "string").slice(0, 20);
}

/** SRT -> WebVTT (commas in timestamps become dots; adds the header). Already-VTT input is returned normalised. */
export function toVtt(src: string): string {
  const text = src.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (/^WEBVTT/.test(text)) return text + "\n";
  const body = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}\n`;
}

/** Plain text of a VTT/SRT file (cue timings, numbers and tags removed) for the on-page transcript. */
export function vttToText(src: string): string {
  const lines = toVtt(src).split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "WEBVTT" || /^\d+$/.test(line) || /-->/.test(line) || /^(NOTE|STYLE|REGION)\b/.test(line)) continue;
    const clean = stripText(line.replace(/<[^>]+>/g, ""));
    if (clean && out[out.length - 1] !== clean) out.push(clean);
  }
  return out.join(" ").slice(0, 100_000);
}

/** Basic structural validation: at least one timing line. */
export const looksLikeCaptions = (src: string) => /\d{1,2}:\d{2}[:.,]\d{2,3}\s*-->\s*\d{1,2}:\d{2}[:.,]\d{2,3}/.test(src);

// ---------------------------------------------------------------- titles
/** "my_clip-final_v2.MP4" -> "My Clip Final V2". Imported/uploaded files get a readable default title. */
export function humanizeFilename(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-.+]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base || /^\d+$/.test(base)) return "Untitled video";
  return base.split(" ").map((w) => (w === w.toLowerCase() || w === w.toUpperCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ").slice(0, 120);
}
