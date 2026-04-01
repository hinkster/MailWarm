import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireTier } from "../../../middleware/tier-guard";
import { WarmingDispatchQueue } from "../../../queues";
import { generateWarmingCurve } from "@mailwarm/shared/src/constants/warming-curves";
import type { TierName } from "@mailwarm/database";
import { getTierLimits } from "@mailwarm/shared/src/constants/tiers";

const CreateScheduleSchema = z.object({
  domainId: z.string().cuid(),
  startDate: z.string().datetime(),
  targetDailyVolume: z.number().int().min(10).max(500000),
  rampCurve: z.enum(["LINEAR", "EXPONENTIAL", "AGGRESSIVE"]).default("EXPONENTIAL"),
  customCurve: z.array(z.object({ day: z.number(), volume: z.number() })).optional(),
  autoReply: z.boolean().default(true),
  autoOpen: z.boolean().default(true),
  autoClick: z.boolean().default(false),
});

export const warmingRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/warming/schedules
  app.get("/schedules", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const schedules = await app.prisma.warmingSchedule.findMany({
      where: { domain: { tenantId: ctx.tenant.id } },
      include: {
        domain: { select: { id: true, name: true, status: true } },
        dailyLogs: { orderBy: { dayNumber: "desc" }, take: 7 },
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ data: schedules });
  });

  // POST /v1/warming/schedules — create warming schedule
  app.post("/schedules", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const body = CreateScheduleSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const { domainId, customCurve, rampCurve, ...rest } = body.data;
    const tier = (ctx.subscription?.tier ?? "STARTER") as TierName;
    const limits = getTierLimits(tier);

    // Custom curves are Pro+ only
    if (customCurve && !limits.customWarmingSchedule) {
      return reply.code(403).send({
        error: "feature_not_available",
        message: "Custom warming curves require the Pro plan or higher.",
      });
    }

    const domain = await app.prisma.domain.findFirst({
      where: { id: domainId, tenantId: ctx.tenant.id },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    const existing = await app.prisma.warmingSchedule.findUnique({ where: { domainId } });
    if (existing) return reply.code(409).send({ error: "Warming schedule already exists for this domain" });

    const schedule = await app.prisma.warmingSchedule.create({
      data: {
        domainId,
        rampCurve,
        customCurve: customCurve ?? undefined,
        ...rest,
        startDate: new Date(rest.startDate),
      },
    });

    // Kick off dispatcher
    await WarmingDispatchQueue.add(
      "start-warming",
      { scheduleId: schedule.id, tenantId: ctx.tenant.id },
      { delay: Math.max(0, new Date(rest.startDate).getTime() - Date.now()) }
    );

    return reply.code(201).send({ data: schedule });
  });

  // GET /v1/warming/schedules/:scheduleId/preview — preview the ramp curve
  app.get("/schedules/preview", async (request, reply) => {
    const query = request.query as { curve?: string; target?: string; days?: string };
    const curve = (query.curve ?? "EXPONENTIAL") as "LINEAR" | "EXPONENTIAL" | "AGGRESSIVE";
    const target = parseInt(query.target ?? "1000", 10);
    const days = parseInt(query.days ?? "30", 10);

    return reply.send({ data: generateWarmingCurve(curve, target, days) });
  });

  // PATCH /v1/warming/schedules/:scheduleId/pause
  app.patch("/schedules/:scheduleId/pause", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { scheduleId } = request.params as { scheduleId: string };

    const schedule = await app.prisma.warmingSchedule.findFirst({
      where: { id: scheduleId, domain: { tenantId: ctx.tenant.id } },
    });
    if (!schedule) return reply.code(404).send({ error: "Schedule not found" });

    const updated = await app.prisma.warmingSchedule.update({
      where: { id: scheduleId },
      data: { status: "PAUSED", pausedAt: new Date() },
    });

    return reply.send({ data: updated });
  });

  // PATCH /v1/warming/schedules/:scheduleId/resume
  app.patch("/schedules/:scheduleId/resume", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { scheduleId } = request.params as { scheduleId: string };

    const updated = await app.prisma.warmingSchedule.update({
      where: { id: scheduleId },
      data: { status: "ACTIVE", pausedAt: null },
    });

    await WarmingDispatchQueue.add("resume-warming", { scheduleId: updated.id });
    return reply.send({ data: updated });
  });
};
