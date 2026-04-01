import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const CreateKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).default(["read", "write"]),
  expiresAt: z.string().datetime().optional(),
});

export const apiKeysRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/api-keys
  app.get("/", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const keys = await app.prisma.apiKey.findMany({
      where: { tenantId: ctx.tenant.id, revokedAt: null },
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        lastUsedAt: true, expiresAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ data: keys });
  });

  // POST /v1/api-keys — create a new API key (plaintext returned once)
  app.post("/", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const body = CreateKeySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const rawKey = `mw_live_${randomBytes(24).toString("hex")}`;
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.slice(0, 12);

    const key = await app.prisma.apiKey.create({
      data: {
        tenantId: ctx.tenant.id,
        name: body.data.name,
        keyHash,
        keyPrefix,
        scopes: body.data.scopes,
        expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
      },
    });

    await app.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        action: "API_KEY_CREATED",
        resourceType: "api_key",
        resourceId: key.id,
        metadata: { name: key.name },
        ipAddress: request.ip,
      },
    });

    // Return plaintext key ONCE — never stored
    return reply.code(201).send({
      data: { id: key.id, name: key.name, keyPrefix, scopes: key.scopes, createdAt: key.createdAt },
      key: rawKey,
      warning: "Store this key securely — it will not be shown again.",
    });
  });

  // DELETE /v1/api-keys/:keyId — revoke
  app.delete("/:keyId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const { keyId } = request.params as { keyId: string };

    await app.prisma.apiKey.update({
      where: { id: keyId, tenantId: ctx.tenant.id },
      data: { revokedAt: new Date() },
    });

    await app.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        action: "API_KEY_REVOKED",
        resourceType: "api_key",
        resourceId: keyId,
        ipAddress: request.ip,
      },
    });

    return reply.code(204).send();
  });
};
