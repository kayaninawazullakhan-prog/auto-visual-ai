import Stripe from "stripe";
import { loadEnv, getFeatures } from "@ava/config";
import { HttpError } from "./api";

/**
 * Lazily-constructed Stripe client.
 *
 * We don't instantiate the SDK at module load: billing is optional ("just add a
 * key"), so importing this file must never throw. The client is built on first
 * use and cached. Pin nothing for `apiVersion` — let the installed SDK use the
 * version it ships with so types stay in lockstep with the dependency.
 */
let client: Stripe | null = null;

/** True when Stripe is configured (STRIPE_SECRET_KEY present). */
export function stripeConfigured(): boolean {
  return getFeatures().billing;
}

/**
 * Return the shared Stripe client, building it on first call.
 *
 * @throws HttpError(503) if billing isn't configured — routes wrap their body in
 * `route()`, which maps this to a clean JSON 503 for the caller.
 */
export function getStripe(): Stripe {
  if (client) return client;

  const { STRIPE_SECRET_KEY } = loadEnv();
  if (!STRIPE_SECRET_KEY) {
    throw new HttpError(
      503,
      "Billing is not configured. Set STRIPE_SECRET_KEY to enable payments.",
      "billing_not_configured",
    );
  }

  client = new Stripe(STRIPE_SECRET_KEY, {
    // Identify our integration in Stripe's request logs / dashboard.
    appInfo: { name: "AUTO VISUAL AI", url: "https://autovisual.ai" },
    // Surface transient network errors as retries rather than hard failures.
    maxNetworkRetries: 2,
    typescript: true,
  });
  return client;
}
