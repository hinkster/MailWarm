import type { GraphQLContext } from "../context";

export const domainResolvers = {
  Query: {
    domains: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.domain.findMany({
        where: { tenantId: ctx.tenantId },
        include: { mailboxes: true, dnsConfig: { include: { records: true } }, warmingSchedule: true },
        orderBy: { createdAt: "desc" },
      });
    },

    domain: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.domain.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { mailboxes: true, dnsConfig: { include: { records: true } }, warmingSchedule: { include: { dailyLogs: true } } },
      });
    },
  },

  Mutation: {
    addDomain: async (_: unknown, { input }: { input: { name: string } }, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.domain.create({
        data: { tenantId: ctx.tenantId, name: input.name.toLowerCase() },
      });
    },

    removeDomain: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      await ctx.prisma.domain.deleteMany({ where: { id, tenantId: ctx.tenantId } });
      return true;
    },

    verifyDomain: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.domain.update({
        where: { id },
        data: { status: "VERIFIED", verifiedAt: new Date() },
      });
    },
  },
};
