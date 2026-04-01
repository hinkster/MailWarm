import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { WorkOS } from "@workos-inc/node";
import { prisma } from "@mailwarm/database";

// Lazy — only instantiated when SSO routes are actually called
function getWorkos() {
  if (!process.env.WORKOS_API_KEY) throw new Error("WORKOS_API_KEY not configured");
  return new WorkOS(process.env.WORKOS_API_KEY);
}

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  orgName: z.string().min(1).max(100),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /v1/auth/register
  app.post("/register", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const { email, password, name, orgName } = body.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);

    // Create user + tenant + subscription in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name, passwordHash },
      });

      const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
      const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

      const tenant = await tx.tenant.create({
        data: { name: orgName, slug: uniqueSlug },
      });

      await tx.tenantMember.create({
        data: { tenantId: tenant.id, userId: user.id, role: "OWNER", joinedAt: new Date() },
      });

      // 14-day trial subscription
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          tier: "STARTER",
          status: "TRIALING",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      return { user, tenant };
    });

    const token = app.jwt.sign(
      { sub: result.user.id, tenantId: result.tenant.id, email },
      { expiresIn: "7d" }
    );

    return reply.code(201).send({
      token,
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      tenant: { id: result.tenant.id, slug: result.tenant.slug, name: result.tenant.name },
    });
  });

  // POST /v1/auth/login
  app.post("/login", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const { email, password } = body.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return reply.code(401).send({ error: "Invalid credentials" });

    // Get primary tenant (first membership)
    const membership = await prisma.tenantMember.findFirst({
      where: { userId: user.id },
      include: { tenant: true },
      orderBy: { joinedAt: "asc" },
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = app.jwt.sign(
      { sub: user.id, tenantId: membership?.tenantId, email },
      { expiresIn: "7d" }
    );

    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      tenant: membership?.tenant
        ? { id: membership.tenant.id, slug: membership.tenant.slug, name: membership.tenant.name }
        : null,
    });
  });

  // GET /v1/auth/me — current user info
  app.get("/me", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const payload = request.user as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    });
    if (!user) return reply.code(404).send({ error: "User not found" });

    const memberships = await prisma.tenantMember.findMany({
      where: { userId: user.id },
      include: { tenant: { include: { subscription: true } } },
    });

    return reply.send({ user, tenants: memberships.map((m) => ({ ...m.tenant, role: m.role })) });
  });

  // POST /v1/auth/logout
  app.post("/logout", async (_, reply) => {
    // JWT is stateless — client drops the token.
    // For session invalidation at scale, add token to Redis blocklist here.
    return reply.send({ success: true });
  });

  // GET /v1/auth/sso/authorize — initiate WorkOS SSO (Pro+ tenants)
  app.get("/sso/authorize", async (request, reply) => {
    const { domain, tenantSlug } = request.query as { domain?: string; tenantSlug?: string };

    let organization: string | undefined;
    if (tenantSlug) {
      const ssoConn = await prisma.ssoConnection.findFirst({
        where: { tenant: { slug: tenantSlug }, enabled: true },
      });
      organization = ssoConn?.workosOrgId;
    }

    const authorizationUrl = getWorkos().sso.getAuthorizationUrl({
      clientId: process.env.WORKOS_CLIENT_ID!,
      redirectUri: `${process.env.NEXT_PUBLIC_API_URL}/v1/auth/sso/callback`,
      ...(domain ? { domain } : {}),
      ...(organization ? { organization } : {}),
    });

    return reply.redirect(authorizationUrl);
  });

  // GET /v1/auth/sso/callback — WorkOS SSO callback
  app.get("/sso/callback", async (request, reply) => {
    const { code } = request.query as { code: string };
    if (!code) return reply.code(400).send({ error: "Missing code" });

    try {
      const { profile } = await getWorkos().sso.getProfileAndToken({
        code,
        clientId: process.env.WORKOS_CLIENT_ID!,
      });

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email: profile.email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: profile.email,
            name: `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim(),
            emailVerified: new Date(),
          },
        });
      }

      // Find tenant via SSO connection
      const ssoConn = await prisma.ssoConnection.findFirst({
        where: { workosOrgId: profile.organizationId ?? "" },
      });

      const tenantId = ssoConn?.tenantId;

      // Ensure membership
      if (tenantId) {
        await prisma.tenantMember.upsert({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          create: { tenantId, userId: user.id, role: "MEMBER", joinedAt: new Date() },
          update: {},
        });
      }

      const token = app.jwt.sign(
        { sub: user.id, tenantId, email: user.email },
        { expiresIn: "7d" }
      );

      // Redirect to web app with token
      const redirectUrl = new URL("/auth/sso-callback", process.env.NEXT_PUBLIC_APP_URL!);
      redirectUrl.searchParams.set("token", token);
      return reply.redirect(redirectUrl.toString());
    } catch (err: any) {
      app.log.error(err);
      return reply.code(500).send({ error: "SSO authentication failed" });
    }
  });
};
