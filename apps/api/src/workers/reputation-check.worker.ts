import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import { runReputationCheck } from "../services/reputation/checker";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const prisma     = new PrismaClient();

export const reputationCheckWorker = new Worker(
  "reputation-check",
  async (job) => {
    const { domainId, domainName } = job.data as { domainId: string; domainName: string };

    job.log(`Running reputation check for ${domainName} (${domainId})`);

    const { score, signals, listedOn } = await runReputationCheck(domainName, domainId, prisma);

    // Persist result
    await prisma.reputationCheck.create({
      data: {
        domainId,
        score,
        signals: signals as any,
        listedOn,
      },
    });

    // Update rolling score on the domain
    await prisma.domain.update({
      where: { id: domainId },
      data: { reputationScore: score },
    });

    job.log(`Reputation score for ${domainName}: ${score}/100 — listed on: ${listedOn.join(", ") || "none"}`);

    return { score, listedOn };
  },
  {
    connection,
    concurrency: 5, // DNSBL lookups are IO-bound, run up to 5 in parallel
  }
);

reputationCheckWorker.on("failed", (job, err) => {
  console.error(`[reputation-check] job ${job?.id} failed:`, err.message);
});
