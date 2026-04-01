import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@mailwarm/database";
import { calculateDayVolume } from "@mailwarm/shared/src/constants/warming-curves";
import { WarmingDispatchQueue, MetricsRollupQueue } from "../queues";
import { sendWarmingEmail } from "../services/warming/sender";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const warmingDispatchWorker = new Worker(
  "warming-dispatch",
  async (job: Job) => {
    if (job.name === "daily-dispatch") {
      await runDailyDispatch();
    } else if (job.name === "start-warming") {
      await startWarming(job.data.scheduleId);
    } else if (job.name === "resume-warming") {
      await resumeWarming(job.data.scheduleId);
    }
  },
  { connection, concurrency: 5 }
);

/**
 * Runs every hour via a repeatable job. Dispatches today's warming emails
 * for all active schedules, respecting per-hour rate limits.
 */
async function runDailyDispatch() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeSchedules = await prisma.warmingSchedule.findMany({
    where: { status: "ACTIVE" },
    include: {
      domain: {
        include: {
          mailboxes: { where: { status: "ACTIVE", role: "CUSTOMER" } },
          tenant: { include: { subscription: true } },
        },
      },
    },
  });

  for (const schedule of activeSchedules) {
    const { domain } = schedule;
    if (!domain.mailboxes.length) continue;

    // Get or create today's log
    let dayLog = await prisma.warmingDayLog.findUnique({
      where: { scheduleId_dayNumber: { scheduleId: schedule.id, dayNumber: schedule.currentDay } },
    });

    const targetVolume = schedule.customCurve
      ? (schedule.customCurve as Array<{ day: number; volume: number }>)
          .find((d) => d.day === schedule.currentDay)?.volume ?? 0
      : calculateDayVolume(
          schedule.rampCurve as any,
          schedule.currentDay,
          schedule.targetDailyVolume
        );

    if (!dayLog) {
      dayLog = await prisma.warmingDayLog.create({
        data: {
          scheduleId: schedule.id,
          dayNumber: schedule.currentDay,
          date: today,
          targetVolume,
        },
      });
    }

    const remaining = targetVolume - dayLog.actualSent;
    if (remaining <= 0) continue;

    // Pick seed mailboxes from pool
    const tier = domain.tenant.subscription?.tier ?? "STARTER";
    const seeds = await prisma.seedMailbox.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { tenantId: domain.tenantId }, // dedicated seeds (Enterprise)
          { tenantId: null, tierPool: tier }, // shared pool
        ],
      },
      take: Math.min(remaining, 50), // batch 50 at a time
    });

    for (const seed of seeds) {
      const senderMailbox = domain.mailboxes[Math.floor(Math.random() * domain.mailboxes.length)];
      await sendWarmingEmail({
        from: senderMailbox,
        to: seed,
        scheduleId: schedule.id,
        dayLogId: dayLog.id,
        autoReply: schedule.autoReply,
        autoOpen: schedule.autoOpen,
        autoClick: schedule.autoClick,
      });
    }

    // Advance day counter if it's a new calendar day
    const lastLog = await prisma.warmingDayLog.findFirst({
      where: { scheduleId: schedule.id },
      orderBy: { dayNumber: "desc" },
    });
    if (lastLog && new Date(lastLog.date).getTime() < today.getTime()) {
      await prisma.warmingSchedule.update({
        where: { id: schedule.id },
        data: { currentDay: { increment: 1 } },
      });
    }
  }
}

async function startWarming(scheduleId: string) {
  const schedule = await prisma.warmingSchedule.update({
    where: { id: scheduleId },
    data: { status: "ACTIVE", currentDay: 1 },
  });
  await prisma.domain.update({
    where: { id: schedule.domainId },
    data: { status: "WARMING" },
  });
}

async function resumeWarming(scheduleId: string) {
  await prisma.warmingSchedule.update({
    where: { id: scheduleId },
    data: { status: "ACTIVE", pausedAt: null },
  });
}

// Register repeatable daily job on worker boot
WarmingDispatchQueue.add(
  "daily-dispatch",
  {},
  { repeat: { pattern: "0 * * * *" } } // every hour
);
