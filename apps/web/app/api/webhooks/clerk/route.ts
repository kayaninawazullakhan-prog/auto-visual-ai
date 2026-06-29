import { Webhook } from "svix";
import { headers } from "next/headers";
import { route, ok, HttpError } from "@/lib/api";
import { prisma } from "@ava/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClerkEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
};

/** Keeps our User table in sync with Clerk (create / update / delete). */
export const POST = route(async (req) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "Clerk webhook is not configured", "not_configured");

  const h = await headers();
  const svixId = h.get("svix-id");
  const svixTimestamp = h.get("svix-timestamp");
  const svixSignature = h.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new HttpError(400, "Missing svix headers");
  }

  const payload = await req.text();
  let evt: ClerkEvent;
  try {
    evt = new Webhook(secret).verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch {
    throw new HttpError(400, "Invalid webhook signature");
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;
    const email = email_addresses?.[0]?.email_address ?? `${id}@clerk.local`;
    const name = [first_name, last_name].filter(Boolean).join(" ") || null;
    await prisma.user.upsert({
      where: { clerkId: id },
      update: { email, name, imageUrl: image_url ?? null },
      create: { clerkId: id, email, name, imageUrl: image_url ?? null },
    });
  } else if (evt.type === "user.deleted") {
    await prisma.user.deleteMany({ where: { clerkId: evt.data.id } });
  }

  return ok({ received: true });
});
