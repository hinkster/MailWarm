import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireTier } from "../../../middleware/tier-guard";
import { DnsProvisionQueue } from "../../../queues";
import { getTierLimits } from "@mailwarm/shared/src/constants/tiers";
import type { TierName } from "@mailwarm/database";

const CreateDomainSchema = z.object({
  name: z.string().min(3).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Invalid domain name"),
});

export const domainsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/domains — list tenant domains
  app.get("/", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const domains = await app.prisma.domain.findMany({
      where: { tenantId: ctx.tenant.id },
      include: {
        warmingSchedule: { select: { status: true, currentDay: true, targetDailyVolume: true } },
        dnsConfig: { select: { provider: true, records: { select: { type: true, status: true } } } },
        _count: { select: { mailboxes: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ data: domains });
  });

  // POST /v1/domains — add a domain
  app.post("/", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const body = CreateDomainSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const tier = (ctx.subscription?.tier ?? "STARTER") as TierName;
    const limits = getTierLimits(tier);
    const count = await app.prisma.domain.count({ where: { tenantId: ctx.tenant.id } });
    if (count >= limits.maxDomains) {
      return reply.code(403).send({
        error: "domain_limit_reached",
        message: `Your plan allows a maximum of ${limits.maxDomains} domains.`,
      });
    }

    const domain = await app.prisma.domain.create({
      data: {
        tenantId: ctx.tenant.id,
        name: body.data.name.toLowerCase(),
      },
    });

    await app.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        action: "DOMAIN_ADDED",
        resourceType: "domain",
        resourceId: domain.id,
        metadata: { name: domain.name },
        ipAddress: request.ip,
      },
    });

    return reply.code(201).send({ data: domain });
  });

  // GET /v1/domains/:domainId
  app.get("/:domainId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { domainId } = request.params as { domainId: string };

    const domain = await app.prisma.domain.findFirst({
      where: { id: domainId, tenantId: ctx.tenant.id },
      include: {
        dnsConfig: { include: { records: true } },
        warmingSchedule: { include: { dailyLogs: { orderBy: { dayNumber: "asc" } } } },
        mailboxes: true,
        _count: { select: { emailEvents: true } },
      },
    });

    if (!domain) return reply.code(404).send({ error: "Domain not found" });
    return reply.send({ data: domain });
  });

  // DELETE /v1/domains/:domainId
  app.delete("/:domainId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { domainId } = request.params as { domainId: string };

    const domain = await app.prisma.domain.findFirst({
      where: { id: domainId, tenantId: ctx.tenant.id },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    await app.prisma.domain.delete({ where: { id: domainId } });

    await app.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        action: "DOMAIN_REMOVED",
        resourceType: "domain",
        resourceId: domainId,
        metadata: { name: domain.name },
        ipAddress: request.ip,
      },
    });

    return reply.code(204).send();
  });

  // POST /v1/domains/:domainId/verify — trigger verification check
  app.post("/:domainId/verify", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { domainId } = request.params as { domainId: string };

    const domain = await app.prisma.domain.findFirst({
      where: { id: domainId, tenantId: ctx.tenant.id },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    // Queue DNS verification job
    await DnsProvisionQueue.add("verify-domain", { domainId: domain.id, tenantId: ctx.tenant.id });

    return reply.send({ message: "Verification queued" });
  });
};
