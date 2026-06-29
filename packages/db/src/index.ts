import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * In dev, Next.js / tsx hot-reload would otherwise spawn a new client (and a new
 * connection pool) on every reload, exhausting Postgres connections. We cache it
 * on `globalThis` outside production.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export the generated client types & enums so consumers import everything
// DB-related from "@ava/db".
export * from "@prisma/client";
export { Prisma } from "@prisma/client";

// Settings store (UI-managed API keys overlaid onto env).
export {
  SETTING_GROUPS,
  ALLOWED_SETTING_KEYS,
  getAllSettings,
  getSettingsStatus,
  upsertSettings,
  syncEnvFromDb,
  type SettingField,
  type SettingGroup,
} from "./settings.js";
