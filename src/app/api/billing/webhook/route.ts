import { NextResponse } from "next/server";
import { applyPlanChange, webhookProvider } from "@/lib/billing";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Stripe (test mode) webhook: flips the tenant's plan. Signature-verified; no session/CSRF (it's server-to-server).
export async function POST(req: Request) {
  const provider = webhookProvider();
  if (!provider) return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  const raw = await req.text();
  let event;
  try {
    event = await provider.parseWebhook(raw, req.headers.get("stripe-signature"));
  } catch (err) {
    logger.warn({ err: String(err) }, "billing webhook rejected");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  if (!event) return NextResponse.json({ received: true });
  if (event.type === "subscription_active") {
    await applyPlanChange(event.tenantId, "premium", { customerId: event.customerId, subscriptionId: event.subscriptionId, currentPeriodEnd: event.currentPeriodEnd });
  } else {
    await applyPlanChange(event.tenantId, "free", { subscriptionId: event.subscriptionId });
  }
  return NextResponse.json({ received: true });
}
