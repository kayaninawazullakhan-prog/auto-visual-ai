import { z } from "zod";
import { route, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { SETTING_GROUPS, getSettingsStatus, upsertSettings, syncEnvFromDb } from "@ava/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Group metadata + masked status (secrets never returned, only set/unset). */
export const GET = route(async () => {
  await requireUser();
  const status = await getSettingsStatus();
  return ok({ groups: SETTING_GROUPS, status });
});

const bodySchema = z.object({ values: z.record(z.string()) });

/** Save API keys / provider selectors and apply them to the live env. */
export const POST = route(async (req) => {
  await requireUser();
  const { values } = await parseBody(req, bodySchema);
  await upsertSettings(values);
  await syncEnvFromDb();
  const status = await getSettingsStatus();
  return ok({ ok: true, status });
});
