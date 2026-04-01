import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DnsProvisionQueue } from "../../../queues";
import { buildAllRecords } from "@mailwarm/shared/src/constants/dns-records";
import { requireTier } from "../../../middleware/tier-guard";

const ConnectDnsSchema = z.object({
  domainId: z.string().cuid(),
  provider: z.enum(["AZURE", "CLOUDFLARE", "ROUTE53", "MANUAL"]),
  zoneId: z.string().optional(),
  credentials: z.record(z.string()).optional(),
});

export const dnsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/dns/:domainId — get DNS config + records for a domain
  app.get("/:domainId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { domainId } = request.params as { domainId: string };

    const domain = await app.prisma.domain.findFirst({
      where: { id: domainId, tenantId: ctx.tenant.id },
      include: { dnsConfig: { include: { records: true } } },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    return reply.send({ data: domain.dnsConfig });
  });

  // POST /v1/dns/connect — connect a DNS provider and auto-provision records
  app.post("/connect", { preHandler: [requireTier("dnsProviders")] }, async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const body = ConnectDnsSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const domain = await app.prisma.domain.findFirst({
      where: { id: body.data.domainId, tenantId: ctx.tenant.id },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    // Upsert DNS config
    const dnsConfig = await app.prisma.dnsConfiguration.upsert({
      where: { domainId: domain.id },
      create: {
        domainId: domain.id,
        provider: body.data.provider as any,
        zoneId: body.data.zoneId,
        credentialRef: body.data.provider !== "MANUAL" ? `dns-creds-${domain.id}` : null,
      },
      update: {
        provider: body.data.provider as any,
        zoneId: body.data.zoneId,
      },
    });

    // Queue DNS provisioning
    await DnsProvisionQueue.add("provision-records", {
      domainId: domain.id,
      dnsConfigId: dnsConfig.id,
      tenantId: ctx.tenant.id,
      credentials: body.data.credentials,
      provider: body.data.provider,
    });

    return reply.code(202).send({ data: dnsConfig, message: "DNS provisioning queued" });
  });

  // GET /v1/dns/:domainId/preview — preview records that would be created
  app.get("/:domainId/preview", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { domainId } = request.params as { domainId: string };

    const domain = await app.prisma.domain.findFirst({
      where: { id: domainId, tenantId: ctx.tenant.id },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    // Return what records WOULD be created (without credentials needed)
    const records = buildAllRecords({
      mtaIp: process.env.MTA_PUBLIC_IP ?? "0.0.0.0",
      mtaHostname: process.env.MTA_HOSTNAME ?? "mail.mailwarm.io",
      domain: domain.name,
      dkimSelector: `mw${Date.now().toString(36)}`,
      dkimPublicKey: "-- Generated at provisioning time --",
      dmarcReportEmail: `dmarc-reports+${domain.name}@mailwarm.io`,
    });

    return reply.send({ data: records });
  });

  // POST /v1/dns/:domainId/verify — re-trigger verification check
  app.post("/:domainId/verify", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { domainId } = request.params as { domainId: string };

    const domain = await app.prisma.domain.findFirst({
      where: { id: domainId, tenantId: ctx.tenant.id },
      include: { dnsConfig: true },
    });
    if (!domain) return reply.code(404).send({ error: "Domain not found" });

    await DnsProvisionQueue.add("verify-records", { domainId: domain.id, dnsConfigId: domain.dnsConfig?.id });
    return reply.send({ message: "Verification check queued" });
  });

  // GET /v1/dns/dkim-key — internal: used by Haraka to get DKIM keys (bearer token protected)
  app.get("/dkim-key", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${process.env.MTA_INTERNAL_TOKEN}`) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const { domain } = request.query as { domain: string };
    const dnsConfig = await app.prisma.dnsConfiguration.findFirst({
      where: { domain: { name: domain } },
      include: { records: { where: { type: "TXT", name: { contains: "_domainkey" } } } },
    });
    const dkimRecord = dnsConfig?.records[0];
    if (!dkimRecord || !dnsConfig?.dkimPrivateKey) return reply.send({ data: null });

    return reply.send({
      data: {
        selector: dkimRecord.name.replace("._domainkey", ""),
        publicKey: dkimRecord.value,
        privateKey: dnsConfig.dkimPrivateKey,
      },
    });
  });
};
