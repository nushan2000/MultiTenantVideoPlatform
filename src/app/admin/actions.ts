"use server";

import { redirect } from "next/navigation";
import { requestIp, requireSuperAdmin } from "@/lib/access";
import { audit } from "@/lib/audit";
import { platformDb } from "@/lib/db/client";
import { invalidateTenant } from "@/lib/tenancy/resolve";

const back = (msg: string): never => redirect(`/admin?ok=${encodeURIComponent(msg)}`);

export async function setTenantStatusAction(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
  const admin = await requireSuperAdmin();
  await platformDb.tenant.update({ where: { id: tenantId }, data: { status } });
  await invalidateTenant(tenantId);
  await audit({ action: status === "SUSPENDED" ? "admin.tenant_suspended" : "admin.tenant_unsuspended", tenantId, userId: admin.id, ip: await requestIp() });
  back(status === "SUSPENDED" ? "Tenant suspended" : "Tenant reinstated");
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
