import type { FastifyPluginAsync } from "fastify";
import { ReputationCheckQueue } from "../../../queues";

export const reputationRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/reputation/:domainId — latest check + history
  app.get("/:domainId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const { domainId } = request.params as { domainId: string };

    const domain = await app.prisma.domain.findUnique({
      where: { id: domainId, tenantId: ctx.tenant.id },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    const [latest, history] = await Promise.all([
      app.prisma.reputationCheck.findFirst({
        where: { domainId },
        orderBy: { checkedAt: "desc" },
      }),
      app.prisma.reputationCheck.findMany({
        where: { domainId },
        orderBy: { checkedAt: "desc" },
        take: 30,
        select: { id: true, score: true, listedOn: true, checkedAt: true },
      }),
    ]);

    return reply.send({ data: { latest, history, currentScore: domain.reputationScore } });
  });

  // POST /v1/reputation/:domainId/check — trigger an on-demand check
  app.post("/:domainId/check", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const { domainId } = request.params as { domainId: string };

    const domain = await app.prisma.domain.findUnique({
      where: { id: domainId, tenantId: ctx.tenant.id },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    const job = await ReputationCheckQueue.add(
      "check",
      { domainId, domainName: domain.name },
      { jobId: `rep-${domainId}-${Date.now()}` }
    );

    return reply.code(202).send({ data: { jobId: job.id, message: "Reputation check queued" } });
  });
};
