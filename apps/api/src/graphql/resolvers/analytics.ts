import type { GraphQLContext } from "../context";
import { generateWarmingCurve } from "@mailwarm/shared/src/constants/warming-curves";

export const analyticsResolvers = {
  Query: {
    domainMetrics: async (
      _: unknown,
      { domainId, from, to }: { domainId: string; from: string; to: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");

      const events = await ctx.prisma.emailEvent.groupBy({
        by: ["type"],
        where: {
          domainId,
          domain: { tenantId: ctx.tenantId },
          occurredAt: { gte: new Date(from), lte: new Date(to) },
        },
        _count: { type: true },
      });

      const counts: Record<string, number> = {};
      for (const e of events) counts[e.type] = e._count.type;

      const sent      = counts.SENT      ?? 0;
      const delivered = counts.DELIVERED ?? 0;
      const opened    = counts.OPENED    ?? 0;
      const clicked   = counts.CLICKED   ?? 0;
      const bounced   = counts.BOUNCED   ?? 0;
      const complained = counts.COMPLAINED ?? 0;

      return {
        sent, delivered, opened, clicked, bounced, complained,
        openRate:   sent > 0 ? opened / sent : 0,
        clickRate:  sent > 0 ? clicked / sent : 0,
        bounceRate: sent > 0 ? bounced / sent : 0,
        inboxPlacementRate: null,
      };
    },

    deliverabilityScore: async (
      _: unknown,
      { domainId }: { domainId: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      const domain = await ctx.prisma.domain.findFirst({
        where: { id: domainId, tenantId: ctx.tenantId },
        select: { reputationScore: true },
      });
      return domain?.reputationScore ?? 0;
    },

    dmarcReports: async (
      _: unknown,
      { domainId, limit = 10 }: { domainId: string; limit?: number },
      ctx: GraphQLContext
    ) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      const domain = await ctx.prisma.domain.findFirst({
        where: { id: domainId, tenantId: ctx.tenantId },
        select: { name: true },
      });
      if (!domain) return [];

      return ctx.prisma.dmarcReport.findMany({
        where: { tenantId: ctx.tenantId, domain: domain.name },
        orderBy: { dateRangeBegin: "desc" },
        take: limit,
      });
    },

    warmingCurvePreview: (
      _: unknown,
      { curve, target, days = 30 }: { curve: string; target: number; days?: number }
    ) => generateWarmingCurve(curve as any, target, days),
  },
};
