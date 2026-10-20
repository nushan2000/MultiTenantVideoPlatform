import { platformDb } from "./db/client";
import { logger } from "./logger";

export type AuditInput = {
  action: string;
  tenantId?: string | null;
  userId?: string | null;
  target?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

/** Never throws: auditing must not break the action being audited, but failures are logged loudly. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await platformDb.auditLog.create({
      data: {
        action: input.action,
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        target: input.target ?? null,
        ip: input.ip ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    });
  } catch (err) {
    logger.error({ err: String(err), ...input }, "AUDIT WRITE FAILED");
  }
}
