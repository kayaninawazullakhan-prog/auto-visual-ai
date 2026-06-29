import { z } from "zod";
import { route, ok, parseBody, HttpError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { priceIdForPlan, type PaidPlan } from "@/lib/billing";
import { prisma, Plan } from "@ava/db";
import { loadEnv } from "@ava/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  plan: z.enum([Plan.STARTER, Plan.PRO, Plan.BUSINESS]),
});

/**
 * POST /api/billing/checkout — start a Stripe Checkout subscription flow.
 *
 * Ensures the user has a Stripe customer (persisted on the Billing row), then
 * creates a subscription-mode Checkout Session and returns its hosted URL.
 * Returns 503 if Stripe is unconfigured (getStripe throws an HttpError(503)).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { plan } = await parseBody(req, bodySchema);

  const priceId = priceIdForPlan(plan as PaidPlan);
  if (!priceId) {
    throw new HttpError(
      503,
      `No Stripe price configured for plan ${plan}. Set STRIPE_PRICE_${plan}.`,
      "price_not_configured",
    );
  }

  const stripe = getStripe();
  const { APP_URL } = loadEnv();

  // Ensure we have a Stripe customer, reusing the one stored on Billing if any.
  const existing = await prisma.billing.findUnique({ where: { userId: user.id } });
  let customerId = existing?.stripeCustomerId ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    // Persist immediately so the customer is reused on retries / the portal.
    await prisma.billing.upsert({
      where: { userId: user.id },
      update: { stripeCustomerId: customerId },
      create: { userId: user.id, stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/billing?status=cancelled`,
    allow_promotion_codes: true,
    // Echo identity onto the subscription so the webhook can resolve the user
    // even before the checkout.session.completed event is processed.
    subscription_data: { metadata: { userId: user.id, plan } },
    metadata: { userId: user.id, plan },
  });

  if (!session.url) {
    throw new HttpError(502, "Stripe did not return a checkout URL", "stripe_no_url");
  }

  return ok({ url: session.url });
});
