import { loadEnv } from "@ava/config";
import { Plan, BillingStatus } from "@ava/db";
import type Stripe from "stripe";

/**
 * Billing domain helpers shared by the checkout, portal, and webhook routes:
 * mapping between our `Plan` enum, Stripe price IDs, monthly credit grants, and
 * Stripe subscription status strings. Kept in one place so a price/credit change
 * is a single edit.
 */

/** Paid plans a user can subscribe to (FREE is the default, no Stripe price). */
export type PaidPlan = Extract<Plan, "STARTER" | "PRO" | "BUSINESS">;

/** Monthly credit grant per plan (refreshed on each successful billing period). */
export const PLAN_CREDITS: Record<Plan, number> = {
  [Plan.FREE]: 20,
  [Plan.STARTER]: 200,
  [Plan.PRO]: 1000,
  [Plan.BUSINESS]: 5000,
};

/** Resolve the configured Stripe price id for a paid plan (undefined if unset). */
export function priceIdForPlan(plan: PaidPlan): string | undefined {
  const env = loadEnv();
  switch (plan) {
    case Plan.STARTER:
      return env.STRIPE_PRICE_STARTER;
    case Plan.PRO:
      return env.STRIPE_PRICE_PRO;
    case Plan.BUSINESS:
      return env.STRIPE_PRICE_BUSINESS;
  }
}

/**
 * Reverse map: a Stripe price id → our Plan. Used by the webhook to translate an
 * incoming subscription's price back into the plan we store. Unknown price →
 * undefined (caller decides how to handle).
 */
export function planForPriceId(priceId: string | null | undefined): Plan | undefined {
  if (!priceId) return undefined;
  const env = loadEnv();
  if (priceId === env.STRIPE_PRICE_STARTER) return Plan.STARTER;
  if (priceId === env.STRIPE_PRICE_PRO) return Plan.PRO;
  if (priceId === env.STRIPE_PRICE_BUSINESS) return Plan.BUSINESS;
  return undefined;
}

/** Translate a Stripe subscription status into our `BillingStatus` enum. */
export function billingStatusFromStripe(status: Stripe.Subscription.Status): BillingStatus {
  switch (status) {
    case "active":
      return BillingStatus.ACTIVE;
    case "trialing":
      return BillingStatus.TRIALING;
    case "past_due":
    case "unpaid":
      return BillingStatus.PAST_DUE;
    case "canceled":
      return BillingStatus.CANCELED;
    case "incomplete":
    case "incomplete_expired":
    case "paused":
    default:
      return BillingStatus.INCOMPLETE;
  }
}

/** Pull the (single) subscription's price id off a Stripe subscription object. */
export function priceIdFromSubscription(sub: Stripe.Subscription): string | undefined {
  return sub.items.data[0]?.price?.id;
}
