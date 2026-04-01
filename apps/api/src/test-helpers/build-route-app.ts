/**
 * Builds a minimal Fastify test app for route-level testing.
 *
 * - Registers @fastify/jwt with a test secret so routes can call app.jwt.sign/verify.
 * - Decorates app.prisma with the supplied mock (routes that use app.prisma).
 * - Injects request.tenantCtx via a preHandler hook so auth checks are skippable.
 */
import Fastify, { type FastifyPluginAsync } from "fastify";
import fastifyJwt from "@fastify/jwt";

export const TEST_JWT_SECRET = "test-secret-for-tests";

export async function buildRouteApp(
  routePlugin: FastifyPluginAsync,
  options: {
    prisma?: any;
    ctx?: any;       // tenantCtx value; undefined → request.tenantCtx will be undefined → routes return 401
    prefix?: string;
  } = {}
) {
  const { prisma = {}, ctx, prefix = "/" } = options;

  const app = Fastify({ logger: false });

  // JWT must be registered as a plugin
  await app.register(fastifyJwt, { secret: TEST_JWT_SECRET });

  // Decorations added directly on the root app are visible to all child plugins
  app.decorate("prisma", prisma);
  app.decorateRequest("tenantCtx", undefined);
  app.addHook("preHandler", async (request) => {
    (request as any).tenantCtx = ctx;
  });

  await app.register(routePlugin, { prefix });
  await app.ready();
  return app;
}

/** Default tenant context used by most authenticated route tests. */
export function makeCtx(overrides: Record<string, any> = {}) {
  return {
    tenant:       { id: "t-1", name: "Test Org",  slug: "test-org-abc", ...overrides.tenant },
    user:         { id: "u-1", email: "user@test.com", name: "Test User", ...overrides.user },
    member:       { tenantId: "t-1", userId: "u-1", role: "OWNER", joinedAt: new Date() },
    subscription: { tier: "GROWTH", status: "ACTIVE", stripeCustomerId: null, ...overrides.subscription },
    ...overrides,
  };
}
