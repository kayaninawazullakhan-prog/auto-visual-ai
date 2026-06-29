/**
 * Seed script — minimal local data for development.
 * Real fixtures (sample project + transcript) are added alongside the pipeline
 * in later phases. Run with `pnpm db:seed`.
 */
import { PrismaClient, Plan } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const demo = await prisma.user.upsert({
    where: { email: "demo@autovisual.ai" },
    update: {},
    create: {
      clerkId: "seed_demo_user",
      email: "demo@autovisual.ai",
      name: "Demo Creator",
      plan: Plan.PRO,
      credits: 1000,
      billing: {
        create: {
          plan: Plan.PRO,
          creditsRemaining: 1000,
        },
      },
    },
  });

  console.log(`Seeded demo user: ${demo.email} (${demo.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
