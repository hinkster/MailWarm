import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { MailboxProvisionQueue } from "../../../queues";
import { getTierLimits } from "@mailwarm/shared/src/constants/tiers";
import type { TierName } from "@mailwarm/database";

const CreateMailboxSchema = z.object({
  domainId: z.string().cuid(),
  displayName: z.string().max(100).optional(),
});

export const mailboxesRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/mailboxes?domainId=
  app.get("/", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { domainId } = request.query as { domainId?: string };

    const mailboxes = await app.prisma.mailbox.findMany({
      where: {
        domain: { tenantId: ctx.tenant.id },
        ...(domainId ? { domainId } : {}),
      },
      include: { domain: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ data: mailboxes });
  });

  // POST /v1/mailboxes — provision a new mailbox
  app.post("/", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const body = CreateMailboxSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const domain = await app.prisma.domain.findFirst({
      where: { id: body.data.domainId, tenantId: ctx.tenant.id },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    const tier = (ctx.subscription?.tier ?? "STARTER") as TierName;
    const limits = getTierLimits(tier);
    const count = await app.prisma.mailbox.count({ where: { domainId: domain.id, role: "CUSTOMER" } });
    if (count >= limits.maxMailboxesPerDomain) {
      return reply.code(403).send({
        error: "mailbox_limit_reached",
        message: `Your plan allows ${limits.maxMailboxesPerDomain} mailboxes per domain.`,
      });
    }

    // Generate local part: warm1, warm2, ...
    const localPart = `warm${count + 1}`;
    const address = `${localPart}@${domain.name}`;

    const mailbox = await app.prisma.mailbox.create({
      data: {
        domainId: domain.id,
        address,
        displayName: body.data.displayName,
        dovecotUsername: address,
        role: "CUSTOMER",
        status: "PROVISIONING",
      },
    });

    await MailboxProvisionQueue.add("provision", {
      mailboxId: mailbox.id,
      address,
      domainId: domain.id,
      tenantId: ctx.tenant.id,
    });

    await app.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        action: "MAILBOX_PROVISIONED",
        resourceType: "mailbox",
        resourceId: mailbox.id,
        metadata: { address },
        ipAddress: request.ip,
      },
    });

    return reply.code(201).send({ data: mailbox });
  });

  // DELETE /v1/mailboxes/:mailboxId
  app.delete("/:mailboxId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { mailboxId } = request.params as { mailboxId: string };

    const mailbox = await app.prisma.mailbox.findFirst({
      where: { id: mailboxId, domain: { tenantId: ctx.tenant.id } },
    });
    if (!mailbox) return reply.code(404).send({ error: "Mailbox not found" });

    await app.prisma.mailbox.update({
      where: { id: mailboxId },
      data: { status: "DELETED" },
    });

    await MailboxProvisionQueue.add("deprovision", { mailboxId, address: mailbox.address });
    return reply.code(204).send();
  });
};
