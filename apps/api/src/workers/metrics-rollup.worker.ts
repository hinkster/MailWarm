import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@mailwarm/database";
import { MetricsRollupQueue, ReputationCheckQueue } from "../queues";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const metricsRollupWorker = new Worker(
  "metrics-rollup",
  async (_job: Job) => {
    // Update reputation scores for all warming domains
    const activeSchedules = await prisma.warmingSchedule.findMany({
      where: { status: "ACTIVE" },
      select: { domainId: true },
    });

    for (const { domainId } of activeSchedules) {
      await updateReputationScore(domainId);
    }
  },
  { connection, concurrency: 2 }
);

async function updateReputationScore(domainId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const events = await prisma.emailEvent.groupBy({
    by: ["type"],
    where: { domainId, occurredAt: { gte: sevenDaysAgo } },
    _count: { type: true },
  });

  const counts: Record<string, number> = {};
  for (const e of events) counts[e.type] = e._count.type;

  const sent       = counts.SENT      ?? 0;
  const delivered  = counts.DELIVERED ?? 0;
  const opened     = counts.OPENED    ?? 0;
  const bounced    = counts.BOUNCED   ?? 0;
  const complained = counts.COMPLAINED ?? 0;

  if (sent === 0) return;

  // Simple scoring model (0–100):
  // Start at 50 base, reward high delivery/open rates, penalise bounces/complaints
  const deliveryRate  = delivered / sent;
  const openRate      = opened / sent;
  const bounceRate    = bounced / sent;
  const complaintRate = complained / sent;

  const score = Math.max(0, Math.min(100, Math.round(
    50
    + deliveryRate * 20
    + openRate * 20
    - bounceRate * 40
    - complaintRate * 60
  )));

  await prisma.domain.update({
    where: { id: domainId },
    data: { reputationScore: score },
  });
}

// Register hourly metrics rollup
MetricsRollupQueue.add("rollup", {}, { repeat: { pattern: "0 * * * *" } });

// Register daily reputation checks for all active domains (runs at 06:00 UTC)
async function scheduleReputationChecks() {
  const domains = await prisma.domain.findMany({
    where: { status: { in: ["VERIFIED", "WARMING", "WARMED"] } },
    select: { id: true, name: true },
  });
  for (const d of domains) {
    await ReputationCheckQueue.add(
      "check",
      { domainId: d.id, domainName: d.name },
      { jobId: `rep-daily-${d.id}`, removeOnComplete: true }
    );
  }
}
MetricsRollupQueue.on("completed", async (job) => {
  if (new Date().getUTCHours() === 6) await scheduleReputationChecks();
});
