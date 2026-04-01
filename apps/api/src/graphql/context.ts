import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@mailwarm/database";
import type { TierName } from "@mailwarm/database";
import { canUseGraphql } from "@mailwarm/shared/src/constants/tiers";

export interface GraphQLContext {
  tenantId: string | null;
  userId: string | null;
  tier: TierName;
  prisma: typeof prisma;
}

export async function createContext({
  request,
  reply,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
}): Promise<GraphQLContext> {
  const ctx = request.tenantCtx;
  const tier = (ctx?.subscription?.tier ?? "STARTER") as TierName;

  // GraphQL access is Growth+ only
  if (ctx && !canUseGraphql(tier)) {
    throw new Error("GraphQL API requires the Growth plan or higher.");
  }

  return {
    tenantId: ctx?.tenant.id ?? null,
    userId: ctx?.user.id ?? null,
    tier,
    prisma,
  };
}
