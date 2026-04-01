import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import { ApolloServer } from "@apollo/server";
import { fastifyApolloDrainPlugin, fastifyApolloHandler } from "@as-integrations/fastify";

import { prismaPlugin } from "./plugins/prisma";
import { redisPlugin } from "./plugins/redis";
import { tenantPlugin } from "./plugins/tenant";
import { schema } from "./graphql/schema";
import { createContext } from "./graphql/context";

// REST route registrations
import { authRoutes } from "./routes/v1/auth";
import { domainsRoutes } from "./routes/v1/domains";
import { mailboxesRoutes } from "./routes/v1/mailboxes";
import { warmingRoutes } from "./routes/v1/warming";
import { analyticsRoutes } from "./routes/v1/analytics";
import { dnsRoutes } from "./routes/v1/dns";
import { billingRoutes } from "./routes/v1/billing";
import { stripeWebhookRoute } from "./routes/v1/webhooks/stripe";
import { dmarcInboundRoute } from "./routes/v1/webhooks/dmarc";
import { webhookEndpointsRoutes } from "./routes/v1/webhooks/endpoints";
import { apiKeysRoutes } from "./routes/v1/apikeys";
import { trackingRoutes } from "./routes/v1/track";
import { teamRoutes }       from "./routes/v1/team";
import { reputationRoutes } from "./routes/v1/reputation";
import { internalRoutes }   from "./routes/v1/internal";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty" }
          : undefined,
    },
    trustProxy: true,
  });

  // ── Security & utilities ──────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"],
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, { secret: process.env.NEXTAUTH_SECRET! });
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: "1 minute",
    redis: undefined, // set after redis plugin registered — see plugin
  });

  // ── Infrastructure plugins ────────────────────────────────────────────────
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(tenantPlugin);

  // ── REST API v1 ───────────────────────────────────────────────────────────
  await app.register(authRoutes,          { prefix: "/v1/auth" });
  await app.register(domainsRoutes,       { prefix: "/v1/domains" });
  await app.register(mailboxesRoutes,     { prefix: "/v1/mailboxes" });
  await app.register(warmingRoutes,       { prefix: "/v1/warming" });
  await app.register(analyticsRoutes,     { prefix: "/v1/analytics" });
  await app.register(dnsRoutes,           { prefix: "/v1/dns" });
  await app.register(billingRoutes,       { prefix: "/v1/billing" });

  // Raw body for Stripe signature verification (must be before JSON parser on this route)
  await app.register(stripeWebhookRoute,       { prefix: "/v1/webhooks" });
  await app.register(dmarcInboundRoute,        { prefix: "/v1/webhooks" });
  await app.register(webhookEndpointsRoutes,   { prefix: "/v1/webhooks" });
  await app.register(apiKeysRoutes,            { prefix: "/v1/api-keys" });
  await app.register(trackingRoutes,           { prefix: "/v1/track" });
  await app.register(teamRoutes,               { prefix: "/v1/team" });
  await app.register(reputationRoutes,         { prefix: "/v1/reputation" });
  await app.register(internalRoutes,           { prefix: "/v1/internal" });

  // ── GraphQL (Growth+ tier) ────────────────────────────────────────────────
  const apollo = new ApolloServer({
    schema,
    plugins: [fastifyApolloDrainPlugin(app)],
  });
  await apollo.start();
  app.route({
    url: "/graphql",
    method: ["GET", "POST", "OPTIONS"],
    handler: fastifyApolloHandler(apollo, { context: createContext }),
  });

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/health", async () => ({ status: "ok", ts: Date.now() }));

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API listening on ${HOST}:${PORT}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
