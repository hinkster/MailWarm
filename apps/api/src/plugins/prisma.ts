import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@mailwarm/database";

declare module "fastify" {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (app) => {
  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => prisma.$disconnect());
});

export { prismaPlugin };
