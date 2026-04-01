import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Tenant, TenantMember, User, Subscription } from "@mailwarm/database";

export interface TenantContext {
  tenant: Tenant;
  member: TenantMember;
  user: User;
  subscription: Subscription | null;
}

declare module "fastify" {
  interface FastifyRequest {
    tenantCtx?: TenantContext;
  }
}

/**
 * Tenant plugin — resolves tenant context from JWT + tenantId header.
 * Routes that need tenant context call `request.jwtVerify()` first,
 * then access `request.tenantCtx`.
 */
const tenantPlugin: FastifyPluginAsync = fp(async (app) => {
  app.decorateRequest("tenantCtx", null);

  app.addHook("preHandler", async (request: FastifyRequest) => {
    // Skip public routes
    const publicPaths = ["/health", "/v1/auth/login", "/v1/auth/register", "/v1/webhooks/stripe"];
    if (publicPaths.some((p) => request.url.startsWith(p))) return;

    try {
      await request.jwtVerify();
    } catch {
      return; // Auth guard on individual routes handles the 401
    }

    const payload = request.user as { sub: string; tenantId?: string };
    const tenantId = payload.tenantId ?? (request.headers["x-tenant-id"] as string);
    if (!tenantId) return;

    const [member, subscription] = await Promise.all([
      app.prisma.tenantMember.findFirst({
        where: { userId: payload.sub, tenantId },
        include: { tenant: true, user: true },
      }),
      app.prisma.subscription.findUnique({ where: { tenantId } }),
    ]);

    if (!member) return;

    request.tenantCtx = {
      tenant: member.tenant,
      member,
      user: member.user,
      subscription,
    };
  });
});

export { tenantPlugin };
