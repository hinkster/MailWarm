import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { BounceProcessorQueue } from "../../../queues";

const EventSchema = z.object({
  type: z.enum(["DELIVERED", "BOUNCED"]),
  scheduleId: z.string(),
  dayLogId: z.string(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

const BounceSchema = z.object({
  bounceFor: z.string().email(),
  rawMessage: z.string(),
  timestamp: z.string().datetime(),
});

export const internalRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/internal/event — called by Haraka MTA plugins
  app.post("/event", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${process.env.MTA_INTERNAL_TOKEN}`) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const body = EventSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const { type, scheduleId, dayLogId, messageId, error } = body.data;

    const dayLog = await app.prisma.warmingDayLog.findUnique({ where: { id: dayLogId } });
    if (!dayLog) return reply.code(404).send({ error: "Day log not found" });

    const schedule = await app.prisma.warmingSchedule.findUnique({
      where: { id: scheduleId },
      include: { domain: { select: { id: true } } },
    });
    if (!schedule) return reply.code(404).send({ error: "Schedule not found" });

    if (type === "DELIVERED") {
      await Promise.all([
        app.prisma.warmingDayLog.update({
          where: { id: dayLogId },
          data: { delivered: { increment: 1 } },
        }),
        app.prisma.emailEvent.create({
          data: {
            domainId: schedule.domain.id,
            messageId,
            type: "DELIVERED",
          },
        }),
      ]);
    } else if (type === "BOUNCED") {
      await Promise.all([
        app.prisma.warmingDayLog.update({
          where: { id: dayLogId },
          data: { bounced: { increment: 1 } },
        }),
        app.prisma.emailEvent.create({
          data: {
            domainId: schedule.domain.id,
            messageId,
            type: "BOUNCED",
            metadata: error ? { error } : undefined,
          },
        }),
      ]);
    }

    return reply.code(204).send();
  });

  // POST /v1/internal/bounce — called by Haraka bounce_handler plugin for DSN messages
  app.post("/bounce", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${process.env.MTA_INTERNAL_TOKEN}`) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const body = BounceSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    await BounceProcessorQueue.add("process-bounce", body.data);
    return reply.code(202).send();
  });
};
