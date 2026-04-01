import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { createHmac } from "crypto";
import { prisma } from "@mailwarm/database";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const webhookDeliveryWorker = new Worker(
  "webhook-delivery",
  async (job: Job) => {
    const { webhookId, eventType, payload } = job.data;

    const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || !webhook.enabled) return;
    if (!webhook.events.includes(eventType) && !webhook.events.includes("*")) return;

    const body = JSON.stringify({ event: eventType, data: payload, ts: Date.now() });
    const sig  = createHmac("sha256", webhook.secret).update(body).digest("hex");

    const delivery = await prisma.webhookDelivery.create({
      data: { webhookId, eventType, payload, attemptCount: job.attemptsMade + 1 },
    });

    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mailwarm-Signature": `sha256=${sig}`,
          "X-Mailwarm-Event": eventType,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          statusCode: res.status,
          response: (await res.text()).slice(0, 1000),
          succeededAt: res.ok ? new Date() : null,
          failedAt: !res.ok ? new Date() : null,
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      // BullMQ will retry with exponential backoff (max 5 attempts)
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          failedAt: new Date(),
          nextRetryAt: new Date(Date.now() + Math.pow(2, job.attemptsMade) * 30_000),
        },
      });
      throw err;
    }
  },
  {
    connection,
    concurrency: 20,
    settings: { backoffStrategies: { exponential: (attempts) => Math.pow(2, attempts) * 30_000 } },
  }
);
