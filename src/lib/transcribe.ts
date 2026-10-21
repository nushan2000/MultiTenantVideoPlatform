import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { platformDb } from "./db/client";
import { entitlements } from "./entitlements";
import { getEnv } from "./env";
import { logger } from "./logger";
import { looksLikeCaptions, parseCaptionsJson, toVtt, vttToText, type Caption } from "./media-meta";
import { findObjectByPrefix, keys, presignGet, putObject } from "./storage";
import { ffmpegPath, run } from "./transcode";

// Automatic captions with a local speech-to-text tool (whisper.cpp, faster-whisper CLI...) configured by WHISPER_COMMAND.
// Self-hosted on purpose: the audio never leaves the server. Runs AFTER the video is READY, so it never delays publishing,
// and it never fails the job: no captions is a degraded result, not an error.

const MAX_AUDIO_SEC = 2 * 3600;

/** Splits a command template into argv without a shell: whitespace separates, "double quotes" group. */
export function splitCommand(template: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  for (let m = re.exec(template); m; m = re.exec(template)) out.push(m[1] ?? m[2]);
  return out;
}

/** Fills {input} / {output} / {lang} in each argument. Throws when the template has no program or no {input}. */
export function buildWhisperCommand(template: string, vars: { input: string; output: string; lang: string }): { bin: string; args: string[] } {
  const parts = splitCommand(template);
  if (!parts.length) throw new Error("WHISPER_COMMAND is empty");
  if (!template.includes("{input}")) throw new Error("WHISPER_COMMAND must contain {input}");
  const fill = (s: string) => s.replaceAll("{input}", vars.input).replaceAll("{output}", vars.output).replaceAll("{lang}", vars.lang);
  return { bin: fill(parts[0]), args: parts.slice(1).map(fill) };
}

function exec(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
    p.on("error", (e) => { clearTimeout(timer); reject(new Error(`Could not start ${path.basename(bin)}: ${e.message}`)); });
    p.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${path.basename(bin)} exited ${code}: ${err.trim().split("\n").slice(-2).join(" | ")}`)); });
  });
}

const languageName = (lang: string) => {
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) ?? lang; } catch { return lang; }
};

export type TranscribeOutcome = "done" | "disabled" | "not_entitled" | "skipped";

export async function transcribeVideo(tenantId: string, videoId: string): Promise<TranscribeOutcome> {
  const env = getEnv();
  if (!env.WHISPER_COMMAND) return "disabled";
  const video = await platformDb.video.findFirst({ where: { id: videoId, tenantId }, include: { tenant: { include: { plan: true } } } });
  if (!video || video.status !== "READY") return "skipped";
  if (!entitlements(video.tenant.plan.key).canUseTranscription) return "not_entitled";
  const lang = env.WHISPER_LANGUAGE;
  const existing = parseCaptionsJson(video.captions);
  if (existing.some((c) => c.lang === lang)) return "skipped"; // the owner already supplied captions
  if ((video.durationSec ?? 0) > MAX_AUDIO_SEC) return "skipped";

  const source = await findObjectByPrefix(`${keys.videoPrefix(tenantId, videoId)}source.`);
  if (!source) return "skipped";
  const work = await mkdtemp(path.join(os.tmpdir(), "vp-asr-"));
  try {
    const wav = path.join(work, "audio.wav");
    await run(ffmpegPath(), ["-y", "-i", await presignGet(source.key, 6 * 3600), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
    const outBase = path.join(work, "transcript");
    const { bin, args } = buildWhisperCommand(env.WHISPER_COMMAND, { input: wav, output: outBase, lang });
    await exec(bin, args, 3 * 3600_000);

    const vttPath = `${outBase}.vtt`;
    if (!(await stat(vttPath).catch(() => null))) throw new Error("The speech-to-text tool did not write {output}.vtt");
    const raw = (await readFile(vttPath, "utf8")).slice(0, 2 * 1024 * 1024);
    if (!looksLikeCaptions(raw)) { logger.info({ videoId }, "no speech detected, no captions created"); return "skipped"; }
    const vtt = toVtt(raw);

    const caption: Caption = { lang, label: `${languageName(lang)} (automatic)`, path: keys.caption(tenantId, videoId, lang) };
    await putObject(caption.path, vtt, "text/vtt; charset=utf-8", "public, max-age=300");
    // re-read just before writing: the owner may have edited the video while we were busy
    const fresh = await platformDb.video.findFirst({ where: { id: videoId, tenantId }, select: { captions: true, transcript: true } });
    const captions = [...parseCaptionsJson(fresh?.captions).filter((c) => c.lang !== lang), caption];
    const transcript = fresh?.transcript?.trim() ? undefined : vttToText(vtt);
    await platformDb.video.updateMany({ where: { id: videoId, tenantId }, data: { captions: captions as unknown as object[], ...(transcript ? { transcript } : {}) } });
    logger.info({ tenantId, videoId, lang }, "automatic captions created");
    return "done";
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
