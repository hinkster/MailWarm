import type { FastifyPluginAsync } from "fastify";
import Stripe from "stripe";
import type { TierName } from "@mailwarm/database";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

const PRICE_TO_TIER: Record<string, TierName> = {
  [process.env.STRIPE_STARTER_PRICE_ID!]:    "STARTER",
  [process.env.STRIPE_GROWTH_PRICE_ID!]:     "GROWTH",
  [process.env.STRIPE_PRO_PRICE_ID!]:        "PRO",
  [process.env.STRIPE_ENTERPRISE_PRICE_ID!]: "ENTERPRISE",
};

export const stripeWebhookRoute: FastifyPluginAsync = async (app) => {
  // Raw body needed for signature verification — register before JSON parser
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_, body, done) => {
    done(null, body);
  });

  app.post("/stripe", async (request, reply) => {
    const sig = request.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      app.log.warn(`Stripe webhook signature failed: ${err.message}`);
      return reply.code(400).send({ error: "Invalid signature" });
    }

    const { type, data } = event;

    if (type === "checkout.session.completed") {
      const session = data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      const tier = (session.metadata?.tier ?? "STARTER") as TierName;
      if (!tenantId) return reply.send({ received: true });

      const stripeSubId = session.subscription as string;
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
      const priceId = stripeSub.items.data[0]?.price.id;

      await app.prisma.subscription.update({
        where: { tenantId },
        data: {
          tier: PRICE_TO_TIER[priceId] ?? tier,
          status: "ACTIVE",
          stripeSubscriptionId: stripeSubId,
          stripePriceId: priceId,
          stripeCustomerId: session.customer as string,
          currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
          trialEndsAt: null,
        },
      });
    }

    else if (type === "customer.subscription.updated") {
      const sub = data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) return reply.send({ received: true });

      const priceId = sub.items.data[0]?.price.id;
      const status = sub.status as string;
      const statusMap: Record<string, string> = {
        active: "ACTIVE", past_due: "PAST_DUE",
        unpaid: "UNPAID", canceled: "CANCELED", trialing: "TRIALING",
      };

      await app.prisma.subscription.update({
        where: { tenantId },
        data: {
          tier: PRICE_TO_TIER[priceId] ?? "STARTER",
          status: (statusMap[status] ?? "ACTIVE") as any,
          stripePriceId: priceId,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
    }

    else if (type === "customer.subscription.deleted") {
      const sub = data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) return reply.send({ received: true });

      await app.prisma.subscription.update({
        where: { tenantId },
        data: { tier: "STARTER", status: "CANCELED" },
      });
    }

    return reply.send({ received: true });
  });
};
