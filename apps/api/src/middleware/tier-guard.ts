import type { FastifyRequest, FastifyReply } from "fastify";
import type { TierName } from "@mailwarm/database";
import { getTierLimits } from "@mailwarm/shared/src/constants/tiers";

type TierFeature = keyof ReturnType<typeof getTierLimits>;

/**
 * Returns a Fastify preHandler that asserts the tenant's tier supports a given feature.
 * Usage:  { preHandler: [requireTier("sso")] }
 */
export function requireTier(feature: TierFeature) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.tenantCtx;
    if (!ctx) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const tier = (ctx.subscription?.tier ?? "STARTER") as TierName;
    const limits = getTierLimits(tier);
    const value = limits[feature];

    const allowed =
      typeof value === "boolean" ? value :
      typeof value === "number"  ? value > 0 :
      value !== null;

    if (!allowed) {
      return reply.code(403).send({
        error: "feature_not_available",
        message: `This feature requires a higher subscription tier.`,
        requiredFeature: feature,
        currentTier: tier,
      });
    }
  };
}

/** Assert the caller has at least a given tier */
export function requireMinTier(minTier: TierName) {
  const order: TierName[] = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });
    const tier = (ctx.subscription?.tier ?? "STARTER") as TierName;
    if (order.indexOf(tier) < order.indexOf(minTier)) {
      return reply.code(403).send({
        error: "tier_upgrade_required",
        message: `This endpoint requires the ${minTier} plan or higher.`,
        currentTier: tier,
        minimumTier: minTier,
      });
    }
  };
}
