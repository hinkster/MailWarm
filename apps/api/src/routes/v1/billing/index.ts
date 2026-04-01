import type { FastifyPluginAsync } from "fastify";
import Stripe from "stripe";
import { z } from "zod";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

const PRICE_IDS: Record<string, string> = {
  STARTER:    process.env.STRIPE_STARTER_PRICE_ID!,
  GROWTH:     process.env.STRIPE_GROWTH_PRICE_ID!,
  PRO:        process.env.STRIPE_PRO_PRICE_ID!,
  ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID!,
};

export const billingRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/billing/subscription — current subscription details
  app.get("/subscription", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const sub = await app.prisma.subscription.findUnique({
      where: { tenantId: ctx.tenant.id },
    });

    return reply.send({ data: sub });
  });

  // POST /v1/billing/checkout — create Stripe checkout session
  app.post("/checkout", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const parsed = z.object({ tier: z.enum(["STARTER", "GROWTH", "PRO", "ENTERPRISE"]) })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { tier } = parsed.data;

    const sub = await app.prisma.subscription.findUnique({ where: { tenantId: ctx.tenant.id } });
    let customerId = sub?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ctx.user.email,
        name: ctx.tenant.name,
        metadata: { tenantId: ctx.tenant.id },
      });
      customerId = customer.id;
      await app.prisma.subscription.update({
        where: { tenantId: ctx.tenant.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: PRICE_IDS[tier], quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=1`,
      metadata: { tenantId: ctx.tenant.id, tier },
      subscription_data: {
        trial_period_days: sub?.status === "TRIALING" ? undefined : 0,
        metadata: { tenantId: ctx.tenant.id },
      },
    });

    return reply.send({ url: session.url });
  });

  // POST /v1/billing/portal — Stripe customer portal
  app.post("/portal", async (request, reply) => {
    const ctx = request.tenantCtx;
    if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

    const sub = await app.prisma.subscription.findUnique({ where: { tenantId: ctx.tenant.id } });
    if (!sub?.stripeCustomerId) {
      return reply.code(400).send({ error: "No billing account found. Please subscribe first." });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });

    return reply.send({ url: session.url });
  });
};
