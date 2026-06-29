import type Stripe from "stripe";
import { route, ok, HttpError } from "@/lib/api";
import { getStripe } from "@/lib/stripe";
import {
  PLAN_CREDITS,
  planForPriceId,
  billingStatusFromStripe,
  priceIdFromSubscription,
} from "@/lib/billing";
import { prisma, Plan, BillingStatus } from "@ava/db";
import { loadEnv } from "@ava/config";

// Webhooks must run on Node (raw body + crypto signature verification) and never
// be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe — Stripe event sink.
 *
 * Verifies the signature against STRIPE_WEBHOOK_SECRET using the *raw* request
 * body, then reconciles our `Billing` row and the denormalized `User.plan` /
 * `User.credits` from the subscription state. Always returns 200 on a verified,
 * handled (or intentionally ignored) event so Stripe stops retrying; 503 if
 * Stripe isn't configured, 400 on a bad signature.
 */
export const POST = route(async (req) => {
  const stripe = getStripe(); // throws 503 if STRIPE_SECRET_KEY is unset
  const { STRIPE_WEBHOOK_SECRET } = loadEnv();
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new HttpError(503, "Stripe webhook is not configured", "webhook_not_configured");
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) throw new HttpError(400, "Missing stripe-signature header");

  // Must be the exact bytes Stripe sent — do NOT parse to JSON first.
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    throw new HttpError(400, "Invalid webhook signature");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      // Subscription mode only; ignore anything else.
      if (session.mode !== "subscription" || !session.subscription) break;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(subscription, {
        customerId: customerIdOf(session.customer),
        userId: session.metadata?.userId,
      });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await syncSubscription(subscription, {
        customerId: customerIdOf(subscription.customer),
        userId: subscription.metadata?.userId,
        // A delete event forces CANCELED regardless of the status field.
        forceCanceled: event.type === "customer.subscription.deleted",
      });
      break;
    }

    default:
      // Acknowledge unhandled event types so Stripe doesn't keep retrying.
      break;
  }

  return ok({ received: true });
});

/** Normalize a Stripe customer field (string | object | null) to an id. */
function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Reconcile a Stripe subscription into our Billing row and denormalized User
 * fields. Resolves the local user by Billing.stripeCustomerId first, falling
 * back to the userId carried in metadata (set at checkout).
 */
async function syncSubscription(
  subscription: Stripe.Subscription,
  opts: { customerId: string | null; userId?: string | null; forceCanceled?: boolean },
): Promise<void> {
  // Resolve which user this subscription belongs to.
  let userId = opts.userId ?? null;
  if (!userId && opts.customerId) {
    const existing = await prisma.billing.findFirst({
      where: { stripeCustomerId: opts.customerId },
      select: { userId: true },
    });
    userId = existing?.userId ?? null;
  }
  if (!userId) {
    console.warn(
      `[stripe webhook] could not resolve user for subscription ${subscription.id}`,
    );
    return;
  }

  const status = opts.forceCanceled
    ? BillingStatus.CANCELED
    : billingStatusFromStripe(subscription.status);

  // A canceled subscription drops the user back to FREE; otherwise map the price.
  const isCanceled = status === BillingStatus.CANCELED;
  const plan = isCanceled
    ? Plan.FREE
    : planForPriceId(priceIdFromSubscription(subscription)) ?? Plan.FREE;

  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  const credits = PLAN_CREDITS[plan];

  await prisma.billing.upsert({
    where: { userId },
    update: {
      stripeCustomerId: opts.customerId ?? undefined,
      stripeSubscriptionId: subscription.id,
      plan,
      status,
      creditsRemaining: credits,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    create: {
      userId,
      stripeCustomerId: opts.customerId ?? undefined,
      stripeSubscriptionId: subscription.id,
      plan,
      status,
      creditsRemaining: credits,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Keep the denormalized User snapshot (used for fast gating) in sync. Credits
  // are reset to the plan grant on each billing event (renewal / change).
  await prisma.user.update({
    where: { id: userId },
    data: { plan, credits },
  });
}
