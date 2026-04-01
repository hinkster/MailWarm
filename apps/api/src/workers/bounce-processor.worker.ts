import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@mailwarm/database";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const bounceProcessorWorker = new Worker(
  "bounce-processor",
  async (job: Job) => {
    const { bounceFor, rawMessage, timestamp } = job.data as {
      bounceFor: string;
      rawMessage: string;
      timestamp: string;
    };

    const mailbox = await prisma.mailbox.findFirst({
      where: { address: bounceFor },
      include: { domain: true },
    });
    if (!mailbox) return;

    // Determine bounce type from DSN code
    const isSoft = /4\d\d/.test(rawMessage);

    await prisma.emailEvent.create({
      data: {
        domainId: mailbox.domainId,
        senderMailboxId: mailbox.id,
        type: "BOUNCED",
        bounceType: isSoft ? "SOFT" : "HARD",
        occurredAt: new Date(timestamp),
        metadata: { raw: rawMessage.slice(0, 2000) },
      },
    });

    // Suspend mailbox on hard bounce to protect domain reputation
    if (!isSoft) {
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { status: "SUSPENDED" },
      });
    }
  },
  { connection, concurrency: 10 }
);
