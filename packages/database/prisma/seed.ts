import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create admin user
  const passwordHash = await bcrypt.hash("admin1234!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@mailwarm.io" },
    update: {},
    create: { email: "admin@mailwarm.io", name: "MailWarm Admin", passwordHash, emailVerified: new Date() },
  });

  // Create admin tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "mailwarm-internal" },
    update: {},
    create: { name: "MailWarm Internal", slug: "mailwarm-internal" },
  });

  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
    update: {},
    create: { tenantId: tenant.id, userId: admin.id, role: "OWNER", joinedAt: new Date() },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id, tier: "ENTERPRISE", status: "ACTIVE" },
  });

  // Seed mailbox pool (shared, for warming)
  const seedAddresses = Array.from({ length: 20 }, (_, i) => `seed${i + 1}@warming.mailwarm.io`);
  for (const address of seedAddresses) {
    await prisma.seedMailbox.upsert({
      where: { address },
      update: {},
      create: { address, status: "ACTIVE", tierPool: "STARTER" },
    });
  }

  // Growth pool seeds
  const growthSeeds = Array.from({ length: 30 }, (_, i) => `gseed${i + 1}@pool.mailwarm.io`);
  for (const address of growthSeeds) {
    await prisma.seedMailbox.upsert({
      where: { address },
      update: {},
      create: { address, status: "ACTIVE", tierPool: "GROWTH" },
    });
  }

  // Pro pool seeds
  const proSeeds = Array.from({ length: 50 }, (_, i) => `pseed${i + 1}@pro-pool.mailwarm.io`);
  for (const address of proSeeds) {
    await prisma.seedMailbox.upsert({
      where: { address },
      update: {},
      create: { address, status: "ACTIVE", tierPool: "PRO" },
    });
  }

  // Enterprise pool seeds
  const enterpriseSeeds = Array.from({ length: 100 }, (_, i) => `eseed${i + 1}@enterprise-pool.mailwarm.io`);
  for (const address of enterpriseSeeds) {
    await prisma.seedMailbox.upsert({
      where: { address },
      update: {},
      create: { address, status: "ACTIVE", tierPool: "ENTERPRISE" },
    });
  }

  // Real seed mailboxes for local development / testing
  const realSeeds = [
    { address: "mailwarm.seed1@gmail.com",   displayName: "Alex Morgan" },
    { address: "jimdaniels10@outlook.com",    displayName: "Jim Daniels" },
    { address: "lisaphelps2026@outlook.com",  displayName: "Lisa Phelps" },
  ];
  for (const seed of realSeeds) {
    await prisma.seedMailbox.upsert({
      where: { address: seed.address },
      update: { status: "ACTIVE" },
      create: { address: seed.address, displayName: seed.displayName, status: "ACTIVE", tierPool: "ENTERPRISE" },
    });
  }

  const totalSeeds = seedAddresses.length + growthSeeds.length + proSeeds.length + enterpriseSeeds.length + realSeeds.length;

  // ── Test domain (no DNS required) ──────────────────────────────────────────
  // Bypasses verification flow so the warming engine can run locally.
  const testDomain = await prisma.domain.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "myownaimodel.ai" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "myownaimodel.ai",
      status: "WARMING",
      verifiedAt: new Date(),
    },
  });

  const testMailbox = await prisma.mailbox.upsert({
    where: { address: "warm1@myownaimodel.ai" },
    update: {},
    create: {
      domainId: testDomain.id,
      address: "warm1@myownaimodel.ai",
      displayName: "MailWarm Test",
      role: "CUSTOMER",
      status: "ACTIVE",
      dovecotUsername: "warm1@myownaimodel.ai",
    },
  });

  await prisma.warmingSchedule.upsert({
    where: { domainId: testDomain.id },
    update: {},
    create: {
      domainId: testDomain.id,
      status: "ACTIVE",
      startDate: new Date(),
      targetDailyVolume: 3,
      currentDay: 1,
      rampCurve: "LINEAR",
      autoReply: true,
      autoOpen: true,
      autoClick: false,
    },
  });

  console.log("✅ Seeding complete");
  console.log(`   Admin: admin@mailwarm.io / admin1234!`);
  console.log(`   Seed pool: ${totalSeeds} mailboxes`);
  console.log(`   Test domain: ${testDomain.name} — mailbox: ${testMailbox.address}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
