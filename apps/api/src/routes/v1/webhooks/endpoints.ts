import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireTier } from "../../../middleware/tier-guard";

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

const VALID_EVENTS = [
  "email.sent", "email.delivered", "email.opened", "email.clicked",
  "email.bounced", "email.complained", "warming.started", "warming.paused",
  "warming.completed", "domain.verified", "*",
];

export const webhookEndpointsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/webhooks/endpoints
  app.get("/endpoints", { preHandler: [requireTier("webhooks")] }, async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const hooks = await app.prisma.webhook.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { _count: { select: { deliveries: true } } },
    });

    return reply.send({ data: hooks });
  });

  // POST /v1/webhooks/endpoints
  app.post("/endpoints", { preHandler: [requireTier("webhooks")] }, async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const body = CreateWebhookSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const invalidEvents = body.data.events.filter((e) => !VALID_EVENTS.includes(e));
    if (invalidEvents.length) {
      return reply.code(400).send({ error: `Invalid events: ${invalidEvents.join(", ")}` });
    }

    const secret = `whsec_${randomBytes(32).toString("hex")}`;
    const hook = await app.prisma.webhook.create({
      data: {
        tenantId: ctx.tenant.id,
        url: body.data.url,
        events: body.data.events,
        secret,
      },
    });

    return reply.code(201).send({
      data: { id: hook.id, url: hook.url, events: hook.events, enabled: hook.enabled },
      secret,
      warning: "Store the signing secret securely — it will not be shown again.",
    });
  });

  // DELETE /v1/webhooks/endpoints/:webhookId
  app.delete("/endpoints/:webhookId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { webhookId } = request.params as { webhookId: string };

    await app.prisma.webhook.delete({
      where: { id: webhookId, tenantId: ctx.tenant.id },
    });

    return reply.code(204).send();
  });

  // GET /v1/webhooks/endpoints/:webhookId/deliveries
  app.get("/endpoints/:webhookId/deliveries", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { webhookId } = request.params as { webhookId: string };

    const deliveries = await app.prisma.webhookDelivery.findMany({
      where: { webhook: { id: webhookId, tenantId: ctx.tenant.id } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return reply.send({ data: deliveries });
  });
};
