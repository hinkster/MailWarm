import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { requireMinTier } from "../../../middleware/tier-guard";
import { TIER_LIMITS } from "@mailwarm/shared/src/constants/tiers";

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
});

export const teamRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/team — list members
  app.get("/", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const members = await app.prisma.tenantMember.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      orderBy: { joinedAt: "asc" },
    });

    return reply.send({ data: members });
  });

  // POST /v1/team/invite — invite a new member (creates a user account with a temp password)
  app.post("/invite", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    // Only OWNER or ADMIN can invite
    if (!["OWNER", "ADMIN"].includes(ctx.member.role)) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    const body = InviteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    // Enforce seat limit
    const tierLimits = TIER_LIMITS[ctx.subscription.tier];
    const currentCount = await app.prisma.tenantMember.count({
      where: { tenantId: ctx.tenant.id },
    });
    if (currentCount >= tierLimits.maxSeats) {
      return reply.code(403).send({
        error: `Seat limit reached (${tierLimits.maxSeats} seats on ${ctx.subscription.tier} plan). Upgrade to add more members.`,
      });
    }

    // Check if already a member
    const existingUser = await app.prisma.user.findUnique({
      where: { email: body.data.email },
    });

    if (existingUser) {
      const alreadyMember = await app.prisma.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: existingUser.id } },
      });
      if (alreadyMember) {
        return reply.code(409).send({ error: "User is already a member of this team" });
      }

      // Add existing user to tenant
      const member = await app.prisma.tenantMember.create({
        data: {
          tenantId: ctx.tenant.id,
          userId: existingUser.id,
          role: body.data.role,
          joinedAt: new Date(),
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      await app.prisma.auditLog.create({
        data: {
          tenantId: ctx.tenant.id,
          userId: ctx.user.id,
          action: "team.invite",
          resource: "TenantMember",
          resourceId: member.id,
          metadata: { email: body.data.email, role: body.data.role },
        },
      });

      return reply.code(201).send({ data: member });
    }

    // Create new user with a temporary password
    const tempPassword = randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const result = await app.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.data.email,
          name: body.data.email.split("@")[0],
          passwordHash,
        },
      });

      const member = await tx.tenantMember.create({
        data: {
          tenantId: ctx.tenant.id,
          userId: user.id,
          role: body.data.role,
          joinedAt: new Date(),
        },
      });

      return { user, member };
    });

    await app.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "team.invite",
        resource: "TenantMember",
        resourceId: result.member.id,
        metadata: { email: body.data.email, role: body.data.role },
      },
    });

    return reply.code(201).send({
      data: {
        id: result.member.id,
        user: { id: result.user.id, email: result.user.email, name: result.user.name },
        role: body.data.role,
      },
      tempPassword,
      note: "Share this temporary password with the invited user. They should change it on first login.",
    });
  });

  // PATCH /v1/team/:memberId — change role
  app.patch("/:memberId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    if (!["OWNER", "ADMIN"].includes(ctx.member.role)) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    const { memberId } = request.params as { memberId: string };
    const body = z.object({ role: z.enum(["MEMBER", "ADMIN"]) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const member = await app.prisma.tenantMember.findUnique({
      where: { id: memberId, tenantId: ctx.tenant.id },
    });
    if (!member) return reply.code(404).send({ error: "Member not found" });
    if (member.role === "OWNER") return reply.code(403).send({ error: "Cannot change role of owner" });

    const updated = await app.prisma.tenantMember.update({
      where: { id: memberId },
      data: { role: body.data.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return reply.send({ data: updated });
  });

  // DELETE /v1/team/:memberId — remove member
  app.delete("/:memberId", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    if (!["OWNER", "ADMIN"].includes(ctx.member.role)) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    const { memberId } = request.params as { memberId: string };

    const member = await app.prisma.tenantMember.findUnique({
      where: { id: memberId, tenantId: ctx.tenant.id },
    });
    if (!member) return reply.code(404).send({ error: "Member not found" });
    if (member.role === "OWNER") return reply.code(403).send({ error: "Cannot remove the owner" });
    if (member.userId === ctx.user.id) return reply.code(403).send({ error: "Cannot remove yourself" });

    await app.prisma.tenantMember.delete({ where: { id: memberId } });

    await app.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        action: "team.remove",
        resource: "TenantMember",
        resourceId: memberId,
        metadata: {},
      },
    });

    return reply.code(204).send();
  });
};
