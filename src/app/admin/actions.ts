"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestIp, requireSuperAdmin } from "@/lib/access";
import { checkAdInput } from "@/lib/ads";
import { audit } from "@/lib/audit";
import { applyPlanChange } from "@/lib/billing";
import { platformDb } from "@/lib/db/client";
import { verifyDomain } from "@/lib/domains";
import { deletePrefix, keys } from "@/lib/storage";
import { invalidateHosts, invalidateTenant } from "@/lib/tenancy/resolve";

const go = (path: string, kind: "ok" | "error", msg: string): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
const back = (msg: string): never => go("/admin", "ok", msg);

export async function setTenantStatusAction(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
  const admin = await requireSuperAdmin();
  await platformDb.tenant.update({ where: { id: tenantId }, data: { status } });
  await invalidateTenant(tenantId);
  await audit({ action: status === "SUSPENDED" ? "admin.tenant_suspended" : "admin.tenant_unsuspended", tenantId, userId: admin.id, ip: await requestIp() });
  go("/admin/sites", "ok", status === "SUSPENDED" ? "Site suspended" : "Site reinstated");
}

export async function blockVideoAction(videoId: string) {
  const admin = await requireSuperAdmin();
  const v = await platformDb.video.update({ where: { id: videoId }, data: { status: "BLOCKED", failureReason: "Blocked by platform admin" }, select: { tenantId: true } });
  await audit({ action: "admin.video_blocked", tenantId: v.tenantId, userId: admin.id, target: videoId, ip: await requestIp() });
  back("Video blocked");
}

export async function adminReportAction(reportId: string, action: "takedown" | "dismiss") {
  const admin = await requireSuperAdmin();
  const r = await platformDb.report.findUnique({ where: { id: reportId } });
  if (!r) return back("Report not found");
  if (action === "takedown") {
    await platformDb.video.update({ where: { id: r.videoId }, data: { status: "BLOCKED", failureReason: "Removed after a report" } });
    await platformDb.report.update({ where: { id: reportId }, data: { status: "ACTIONED" } });
  } else {
    await platformDb.report.update({ where: { id: reportId }, data: { status: "DISMISSED" } });
  }
  await audit({ action: `admin.report_${action}`, tenantId: r.tenantId, userId: admin.id, target: reportId, ip: await requestIp(), metadata: { videoId: r.videoId } });
  back(action === "takedown" ? "Video taken down" : "Report dismissed");
}

// ---------------------------------------------------------------- users

async function otherUser(userId: string) {
  const admin = await requireSuperAdmin();
  const user = await platformDb.user.findUnique({ where: { id: userId }, include: { memberships: { select: { tenantId: true, role: true } } } });
  if (!user) return go("/admin/users", "error", "User not found");
  if (user.id === admin.id) return go("/admin/users", "error", "You can't do that to your own account");
  return { admin, user };
}

export async function setUserSuspendedAction(userId: string, suspend: boolean) {
  const { admin, user } = await otherUser(userId);
  await platformDb.user.update({ where: { id: user.id }, data: { suspendedAt: suspend ? new Date() : null } });
  await audit({ action: suspend ? "admin.user_suspended" : "admin.user_unsuspended", userId: admin.id, target: user.email, ip: await requestIp() });
  go("/admin/users", "ok", suspend ? `${user.email} suspended` : `${user.email} reinstated`);
}

export async function setUserSuperAdminAction(userId: string, makeAdmin: boolean) {
  const { admin, user } = await otherUser(userId);
  await platformDb.user.update({ where: { id: user.id }, data: { isSuperAdmin: makeAdmin } });
  await audit({ action: makeAdmin ? "admin.user_promoted" : "admin.user_demoted", userId: admin.id, target: user.email, ip: await requestIp() });
  go("/admin/users", "ok", makeAdmin ? `${user.email} is now a super admin` : `${user.email} is no longer a super admin`);
}

export async function resetUserPasswordAction(userId: string, formData: FormData) {
  const { admin, user } = await otherUser(userId);
  const parsed = z.string().min(10, "Password must be at least 10 characters").max(200).safeParse(formData.get("password"));
  if (!parsed.success) return go("/admin/users", "error", parsed.error.issues[0].message);
  await platformDb.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data, 12) } });
  await audit({ action: "admin.user_password_reset", userId: admin.id, target: user.email, ip: await requestIp() });
  go("/admin/users", "ok", `Password changed for ${user.email}`);
}

export async function deleteUserAction(userId: string) {
  const { admin, user } = await otherUser(userId);
  // Refuse when this user is the only owner of a site: deleting would orphan it.
  for (const m of user.memberships.filter((m) => m.role === "OWNER")) {
    const others = await platformDb.membership.count({ where: { tenantId: m.tenantId, role: "OWNER", userId: { not: user.id } } });
    if (!others) return go("/admin/users", "error", `${user.email} is the only owner of a site. Delete that site first.`);
  }
  await platformDb.user.delete({ where: { id: user.id } });
  await audit({ action: "admin.user_deleted", userId: admin.id, target: user.email, ip: await requestIp() });
  go("/admin/users", "ok", `${user.email} deleted`);
}

// ---------------------------------------------------------------- sites

export async function setTenantPlanAction(tenantId: string, formData: FormData) {
  const admin = await requireSuperAdmin();
  const planKey = z.enum(["free", "premium"]).parse(formData.get("plan"));
  await applyPlanChange(tenantId, planKey, { actor: admin.id });
  go("/admin/sites", "ok", `Plan set to ${planKey}`);
}

export async function setTenantCategoryAction(tenantId: string, formData: FormData) {
  const admin = await requireSuperAdmin();
  const contentCategory = z.enum(["GENERAL", "ADULT"]).parse(formData.get("category"));
  await platformDb.tenant.update({ where: { id: tenantId }, data: { contentCategory } });
  await invalidateTenant(tenantId);
  await audit({ action: "admin.tenant_category", tenantId, userId: admin.id, ip: await requestIp(), metadata: { contentCategory } });
  go("/admin/sites", "ok", "Content type updated");
}

export async function deleteTenantAction(tenantId: string, formData: FormData) {
  const admin = await requireSuperAdmin();
  const t = await platformDb.tenant.findUnique({ where: { id: tenantId }, include: { domains: { select: { hostname: true } } } });
  if (!t) return go("/admin/sites", "error", "Site not found");
  if (String(formData.get("confirm") ?? "").trim() !== t.slug) return go("/admin/sites", "error", `Type the site slug (${t.slug}) to confirm deletion`);
  await deletePrefix(keys.tenantPrefix(t.id)); // media first: if this fails the site is still intact
  await platformDb.tenant.delete({ where: { id: t.id } });
  await invalidateHosts(t.domains.map((d) => d.hostname));
  await invalidateTenant(t.id);
  await audit({ action: "admin.tenant_deleted", userId: admin.id, target: t.slug, ip: await requestIp() });
  go("/admin/sites", "ok", `${t.slug} deleted`);
}

// ---------------------------------------------------------------- domains

export async function adminVerifyDomainAction(domainId: string) {
  await requireSuperAdmin();
  const status = await verifyDomain(domainId);
  go("/admin/domains", status === "ACTIVE" || status === "VERIFIED" ? "ok" : "error", status === "ACTIVE" ? "Domain is live" : status === "VERIFIED" ? "DNS verified, certificate pending" : `Not verified yet (${status.toLowerCase()})`);
}

export async function adminRemoveDomainAction(domainId: string) {
  const admin = await requireSuperAdmin();
  const d = await platformDb.customDomain.findUnique({ where: { id: domainId } });
  if (!d) return go("/admin/domains", "error", "Domain not found");
  await platformDb.customDomain.delete({ where: { id: d.id } });
  await invalidateHosts([d.hostname]);
  await audit({ action: "admin.domain_removed", tenantId: d.tenantId, userId: admin.id, target: d.hostname, ip: await requestIp() });
  go("/admin/domains", "ok", `${d.hostname} removed`);
}

// ---------------------------------------------------------------- ads

export async function adminSaveAdsAction(tenantId: string, formData: FormData) {
  const admin = await requireSuperAdmin();
  const t = await platformDb.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, contentCategory: true } });
  if (!t) return go("/admin/ads", "error", "Site not found");
  const mode = z.enum(["PLATFORM", "CUSTOM"]).parse(formData.get("mode"));
  let vast: string | null = null;
  let html: string | null = null;
  if (mode === "CUSTOM") {
    const checked = checkAdInput(t.contentCategory, { vastTagUrl: String(formData.get("vastTagUrl") ?? ""), htmlSnippet: String(formData.get("htmlSnippet") ?? "") });
    if (!checked.ok) return go("/admin/ads", "error", `${t.slug}: ${checked.error}`);
    vast = checked.vastTagUrl;
    html = checked.htmlSnippet;
  }
  const data = { mode, enabled: mode === "CUSTOM" ? formData.get("enabled") === "on" : true, vastTagUrl: vast, htmlSnippet: html };
  await platformDb.adConfig.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
  await audit({ action: "admin.ads_updated", tenantId, userId: admin.id, ip: await requestIp(), metadata: { mode, enabled: data.enabled } });
  go("/admin/ads", "ok", `Ads saved for ${t.slug}`);
}
