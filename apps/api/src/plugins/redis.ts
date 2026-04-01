import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { Redis } from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = fp(async (app) => {
  const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true });
  await redis.connect();

  app.decorate("redis", redis);
  app.addHook("onClose", async () => redis.quit());
});

export { redisPlugin };
