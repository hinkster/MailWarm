import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const DateRangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  domainId: z.string().cuid().optional(),
});

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/analytics/metrics
  app.get("/metrics", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const query = DateRangeSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() });

    const { from, to, domainId } = query.data;
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const events = await app.prisma.emailEvent.groupBy({
      by: ["type"],
      where: {
        domain: { tenantId: ctx.tenant.id },
        ...(domainId ? { domainId } : {}),
        occurredAt: { gte: fromDate, lte: toDate },
      },
      _count: { type: true },
    });

    const counts: Record<string, number> = {};
    for (const e of events) counts[e.type] = e._count.type;

    const sent      = counts.SENT      ?? 0;
    const delivered = counts.DELIVERED ?? 0;
    const opened    = counts.OPENED    ?? 0;
    const clicked   = counts.CLICKED   ?? 0;
    const bounced   = counts.BOUNCED   ?? 0;
    const complained = counts.COMPLAINED ?? 0;
    const replied   = counts.REPLIED   ?? 0;

    return reply.send({
      data: {
        sent, delivered, opened, clicked, bounced, complained, replied,
        openRate:    sent > 0 ? +(opened / sent * 100).toFixed(2) : 0,
        clickRate:   sent > 0 ? +(clicked / sent * 100).toFixed(2) : 0,
        bounceRate:  sent > 0 ? +(bounced / sent * 100).toFixed(2) : 0,
        replyRate:   sent > 0 ? +(replied / sent * 100).toFixed(2) : 0,
      },
    });
  });

  // GET /v1/analytics/timeseries — daily event counts for charting
  app.get("/timeseries", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const query = DateRangeSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() });

    const { from, to, domainId } = query.data;

    const events = await app.prisma.emailEvent.findMany({
      where: {
        domain: { tenantId: ctx.tenant.id },
        ...(domainId ? { domainId } : {}),
        occurredAt: { gte: new Date(from), lte: new Date(to) },
      },
      select: { type: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });

    // Group by date + type
    const byDate: Record<string, Record<string, number>> = {};
    for (const e of events) {
      const date = e.occurredAt.toISOString().slice(0, 10);
      byDate[date] ??= {};
      byDate[date][e.type] = (byDate[date][e.type] ?? 0) + 1;
    }

    const data = Object.entries(byDate).map(([date, counts]) => ({ date, ...counts }));
    return reply.send({ data });
  });

  // GET /v1/analytics/domains — per-domain deliverability summary
  app.get("/domains", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const domains = await app.prisma.domain.findMany({
      where: { tenantId: ctx.tenant.id },
      select: {
        id: true, name: true, status: true, reputationScore: true,
        warmingSchedule: { select: { status: true, currentDay: true, targetDailyVolume: true } },
        _count: { select: { emailEvents: true, mailboxes: true } },
      },
    });

    return reply.send({ data: domains });
  });

  // GET /v1/analytics/dmarc
  app.get("/dmarc", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { domainName, limit = "20" } = request.query as { domainName?: string; limit?: string };

    const reports = await app.prisma.dmarcReport.findMany({
      where: {
        tenantId: ctx.tenant.id,
        ...(domainName ? { domain: domainName } : {}),
      },
      orderBy: { dateRangeBegin: "desc" },
      take: parseInt(limit),
    });

    return reply.send({ data: reports });
  });
};
