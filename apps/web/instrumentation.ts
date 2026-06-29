/**
 * Runs once when the Next server boots. Loads UI-managed settings (API keys)
 * from the DB and overlays them onto process.env so the web process picks up
 * keys saved on the Settings page.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { syncEnvFromDb } = await import("@ava/db");
      await syncEnvFromDb();
    } catch (err) {
      console.error("[instrumentation] settings sync failed:", err);
    }
  }
}
