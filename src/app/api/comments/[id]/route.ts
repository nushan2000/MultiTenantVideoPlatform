import { z } from "zod";
import { apiTenant } from "@/lib/access";
import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { platformDb } from "@/lib/db/client";
import { HttpError } from "@/lib/ingest/types";

async function load(id: string) {
  const row = await platformDb.comment.findUnique({ where: { id }, select: { tenantId: true } });
  if (!row) throw new HttpError(404, "Comment not found", "not_found");
  return apiTenant(row.tenantId); // any member (owner, admin, editor) may moderate
}

// PATCH /api/comments/:id  { status: "APPROVED" | "HIDDEN" | "PENDING" }
export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { status } = z.object({ status: z.enum(["APPROVED", "HIDDEN", "PENDING"]) }).parse(await req.json());
  const a = await load(id);
  await a.db.comment.updateMany({ where: { id }, data: { status } });
  await audit({ action: "comment.moderated", tenantId: a.tenant.id, userId: a.userRow.id, target: id, metadata: { status } });
  return { ok: true, status };
});

export const DELETE = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const a = await load(id);
  await a.db.comment.deleteMany({ where: { id } });
  await audit({ action: "comment.deleted", tenantId: a.tenant.id, userId: a.userRow.id, target: id });
  return { ok: true };
});
