import { route, ok, HttpError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@ava/db";
import { loadEnv } from "@ava/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/portal — open the Stripe Billing Portal.
 *
 * Lets a subscribed user manage their plan / payment method / cancellation.
 * Requires an existing Stripe customer (created during checkout). Returns 503 if
 * Stripe is unconfigured, 404 if the user has no customer yet.
 */
export const POST = route(async () => {
  const user = await requireUser();
  const stripe = getStripe();
  const { APP_URL } = loadEnv();

  const billing = await prisma.billing.findUnique({ where: { userId: user.id } });
  if (!billing?.stripeCustomerId) {
    throw new HttpError(
      404,
      "No billing account yet. Start a subscription first.",
      "no_customer",
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${APP_URL}/billing`,
  });

  return ok({ url: session.url });
});
