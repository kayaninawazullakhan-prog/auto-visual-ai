import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma, type User, Plan } from "@ava/db";
import { getFeatures, loadEnv } from "@ava/config";
import { unauthorized } from "./api";

export function clerkConfigured(): boolean {
  return getFeatures().auth;
}

/**
 * Resolve the current user, syncing the Clerk identity into our DB.
 *
 * When Clerk isn't configured, fall back to the seeded demo user — always in
 * development, and in production only when DEMO_MODE=true (public portfolio
 * demos). Otherwise, missing auth in production → 401.
 */
export async function requireUser(): Promise<User> {
  if (!clerkConfigured()) {
    const allowDemo =
      process.env.NODE_ENV !== "production" || loadEnv().DEMO_MODE === "true";
    if (!allowDemo) {
      throw unauthorized("Authentication is not configured");
    }
    return getDevUser();
  }

  const { userId } = await auth();
  if (!userId) throw unauthorized();

  const clerkUser = await currentUser();
  const email =
    clerkUser?.emailAddresses?.[0]?.emailAddress ?? `${userId}@clerk.local`;
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null;

  return prisma.user.upsert({
    where: { clerkId: userId },
    update: { email, name, imageUrl: clerkUser?.imageUrl ?? null },
    create: {
      clerkId: userId,
      email,
      name,
      imageUrl: clerkUser?.imageUrl ?? null,
    },
  });
}

/** Non-throwing variant for pages that render differently when signed out. */
export async function getOptionalUser(): Promise<User | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

async function getDevUser(): Promise<User> {
  return prisma.user.upsert({
    where: { email: "demo@autovisual.ai" },
    update: {},
    create: {
      clerkId: "seed_demo_user",
      email: "demo@autovisual.ai",
      name: "Demo Creator",
      plan: Plan.PRO,
      credits: 1000,
    },
  });
}
