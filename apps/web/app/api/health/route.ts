import { route, ok } from "@/lib/api";
import { getFeatures } from "@ava/config";
import { syncEnvFromDb } from "@ava/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  // Overlay the latest UI-saved keys so the feature flags reflect current state.
  await syncEnvFromDb();
  return ok({ status: "ok", features: getFeatures(), time: new Date().toISOString() });
});
