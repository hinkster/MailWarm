import type { GraphQLContext } from "../context";
import { generateWarmingCurve } from "@mailwarm/shared/src/constants/warming-curves";

export const warmingResolvers = {
  Query: {
    warmingSchedules: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.warmingSchedule.findMany({
        where: { domain: { tenantId: ctx.tenantId } },
        include: { dailyLogs: { orderBy: { dayNumber: "asc" } }, domain: true },
        orderBy: { createdAt: "desc" },
      });
    },

    warmingSchedule: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.warmingSchedule.findFirst({
        where: { id, domain: { tenantId: ctx.tenantId } },
        include: { dailyLogs: { orderBy: { dayNumber: "asc" } }, domain: true },
      });
    },

    warmingCurvePreview: (
      _: unknown,
      { curve, target, days = 30 }: { curve: string; target: number; days?: number }
    ) => generateWarmingCurve(curve as any, target, days),
  },

  Mutation: {
    pauseWarming: async (_: unknown, { scheduleId }: { scheduleId: string }, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.warmingSchedule.update({
        where: { id: scheduleId },
        data: { status: "PAUSED", pausedAt: new Date() },
        include: { dailyLogs: true },
      });
    },

    resumeWarming: async (_: unknown, { scheduleId }: { scheduleId: string }, ctx: GraphQLContext) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.warmingSchedule.update({
        where: { id: scheduleId },
        data: { status: "ACTIVE", pausedAt: null },
        include: { dailyLogs: true },
      });
    },

    createWarmingSchedule: async (
      _: unknown,
      { input }: { input: any },
      ctx: GraphQLContext
    ) => {
      if (!ctx.tenantId) throw new Error("Unauthorized");
      return ctx.prisma.warmingSchedule.create({
        data: {
          domainId: input.domainId,
          startDate: new Date(input.startDate),
          targetDailyVolume: input.targetDailyVolume,
          rampCurve: input.rampCurve ?? "EXPONENTIAL",
          autoReply: input.autoReply ?? true,
          autoOpen: input.autoOpen ?? true,
          autoClick: input.autoClick ?? false,
          customCurve: input.customCurve ?? undefined,
        },
        include: { dailyLogs: true },
      });
    },
  },
};
