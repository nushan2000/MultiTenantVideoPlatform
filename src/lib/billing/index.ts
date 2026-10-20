import Stripe from "stripe";
import { audit } from "../audit";
import { platformDb } from "../db/client";
import { getEnv } from "../env";
import { invalidateTenant } from "../tenancy/resolve";
import type { PlanKey } from "../entitlements";

export type CheckoutInput = { tenantId: string; tenantSlug: string; email: string; successUrl: string; cancelUrl: string };
export type BillingEvent =
  | { type: "subscription_active"; tenantId: string; customerId?: string; subscriptionId?: string; currentPeriodEnd?: Date }
  | { type: "subscription_ended"; tenantId: string; subscriptionId?: string };

/**
 * Swap this to change processors. Adult-content tenants need a high-risk processor in production, so providers are
 * chosen per tenant content category (see `billingProviderFor`).
 */
export interface BillingProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  /** Verify the signature and translate the processor's event. Returns null for events we don't care about. */
  parseWebhook(rawBody: string, signature: string | null): Promise<BillingEvent | null>;
}

export class BillingUnavailableError extends Error {}

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";
  private stripe: Stripe;
  constructor(
    secretKey: string,
    private webhookSecret: string | undefined,
    private priceId: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createCheckout(i: CheckoutInput) {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.priceId, quantity: 1 }],
      customer_email: i.email,
      client_reference_id: i.tenantId,
      metadata: { tenantId: i.tenantId },
      subscription_data: { metadata: { tenantId: i.tenantId } },
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return { url: session.url };
  }

  async parseWebhook(rawBody: string, signature: string | null): Promise<BillingEvent | null> {
    if (!this.webhookSecret || !signature) throw new Error("Webhook signature missing");
    const event = await this.stripe.webhooks.constructEventAsync(rawBody, signature, this.webhookSecret);
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const tenantId = s.client_reference_id ?? s.metadata?.tenantId;
        if (!tenantId || s.payment_status === "unpaid") return null;
        return { type: "subscription_active", tenantId, customerId: typeof s.customer === "string" ? s.customer : undefined, subscriptionId: typeof s.subscription === "string" ? s.subscription : undefined };
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenantId;
        if (!tenantId) return null;
        const alive = event.type === "customer.subscription.updated" && (sub.status === "active" || sub.status === "trialing");
        return alive
          ? { type: "subscription_active", tenantId, subscriptionId: sub.id }
          : { type: "subscription_ended", tenantId, subscriptionId: sub.id };
      }
      default:
        return null;
    }
  }
}

let stripeProvider: BillingProvider | null | undefined;
function stripe(): BillingProvider | null {
  if (stripeProvider === undefined) {
    const e = getEnv();
    stripeProvider = e.STRIPE_SECRET_KEY && e.STRIPE_PRICE_PREMIUM ? new StripeBillingProvider(e.STRIPE_SECRET_KEY, e.STRIPE_WEBHOOK_SECRET, e.STRIPE_PRICE_PREMIUM) : null;
  }
  return stripeProvider;
}

/** Register a high-risk processor for adult tenants here without touching callers. */
const providers: Record<"GENERAL" | "ADULT", () => BillingProvider | null> = {
  GENERAL: stripe,
  ADULT: () => null, // Stripe prohibits most adult content: plug in an adult-friendly processor before launch.
};

export function billingProviderFor(contentCategory: "GENERAL" | "ADULT"): BillingProvider {
  const p = providers[contentCategory]();
  if (!p) {
    throw new BillingUnavailableError(
      contentCategory === "ADULT"
        ? "Online upgrades are not available for adult-content sites yet. Please contact support."
        : "Billing is not configured.",
    );
  }
  return p;
}

/** Webhooks must be verified by the same provider that issued them; the endpoint tries the general provider. */
export const webhookProvider = (): BillingProvider | null => stripe();

export const devBillingEnabled = () => process.env.NODE_ENV !== "production" && !getEnv().STRIPE_SECRET_KEY;

/**
 * Flip a tenant's plan and apply downgrade rules:
 *   - custom domains are deactivated (-> PENDING) so the site falls back to its subdomain; the rows are kept
 *   - content is kept; uploads/imports are blocked naturally while over quota
 *   - ads/CSS/theme are gated at render time by entitlements, so no data is destroyed
 */
export async function applyPlanChange(tenantId: string, planKey: PlanKey, info: { customerId?: string; subscriptionId?: string; currentPeriodEnd?: Date; actor?: string } = {}) {
  const plan = await platformDb.plan.upsert({ where: { key: planKey }, update: {}, create: { key: planKey, name: planKey === "free" ? "Free" : "Premium" } });
  const tenant = await platformDb.tenant.findUnique({ where: { id: tenantId }, include: { plan: true, domains: true } });
  if (!tenant) return;
  const before = tenant.plan.key;
  await platformDb.tenant.update({ where: { id: tenantId }, data: { planId: plan.id } });

  if (planKey === "premium") {
    await platformDb.subscription.deleteMany({ where: { tenantId } });
    await platformDb.subscription.create({
      data: { tenantId, planId: plan.id, status: "ACTIVE", providerCustomerId: info.customerId, providerSubscriptionId: info.subscriptionId, currentPeriodEnd: info.currentPeriodEnd },
    });
  } else {
    await platformDb.subscription.updateMany({ where: { tenantId }, data: { status: "CANCELED" } });
    await platformDb.customDomain.updateMany({ where: { tenantId, status: { in: ["VERIFIED", "ACTIVE"] } }, data: { status: "PENDING", tlsStatus: "none" } });
  }
  await invalidateTenant(tenantId);
  await audit({ action: "plan.changed", tenantId, userId: info.actor ?? null, metadata: { from: before, to: planKey } });
}
