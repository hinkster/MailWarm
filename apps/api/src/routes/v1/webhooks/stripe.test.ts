import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// ─── Stripe mock ───────────────────────────────────────────────────────────────
const mockConstructEvent    = vi.hoisted(() => vi.fn());
const mockSubRetrieve       = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    this.webhooks      = { constructEvent: mockConstructEvent };
    this.subscriptions = { retrieve: mockSubRetrieve };
  }),
}));

import { stripeWebhookRoute } from "./stripe";

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockSubUpdate = vi.fn();

function makePrisma() {
  return { subscription: { update: mockSubUpdate } };
}

function makeStripeEvent(type: string, object: Record<string, any>) {
  return { type, data: { object } };
}

function makeStripeSub(overrides?: object) {
  return {
    id: "sub_abc", status: "active",
    metadata: { tenantId: "t-1" },
    items: { data: [{ price: { id: process.env.STRIPE_GROWTH_PRICE_ID ?? "price_growth" } }] },
    current_period_start: 1700000000,
    current_period_end:   1702592000,
    cancel_at_period_end: false,
    ...overrides,
  };
}

async function buildApp() {
  const app = Fastify({ logger: false });
  app.decorate("prisma", makePrisma());
  await app.register(stripeWebhookRoute);
  await app.ready();
  return app;
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.STRIPE_GROWTH_PRICE_ID = "price_growth";
  process.env.STRIPE_WEBHOOK_SECRET  = "whsec_test";
  mockSubUpdate.mockResolvedValue({});
  app = await buildApp();
});

afterEach(() => app.close());

describe("POST /stripe", () => {
  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error("Invalid signature"); });

    const res = await app.inject({
      method: "POST", url: "/stripe",
      headers: { "stripe-signature": "bad-sig", "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid signature");
  });

  it("handles checkout.session.completed and updates subscription", async () => {
    const session = {
      metadata: { tenantId: "t-1", tier: "GROWTH" },
      subscription: "sub_abc",
      customer: "cus_abc",
    };
    mockConstructEvent.mockReturnValue(makeStripeEvent("checkout.session.completed", session));
    mockSubRetrieve.mockResolvedValue(makeStripeSub());

    const res = await app.inject({
      method: "POST", url: "/stripe",
      headers: { "stripe-signature": "sig", "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
    expect(mockSubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-1" },
        data: expect.objectContaining({ status: "ACTIVE", stripeCustomerId: "cus_abc" }),
      })
    );
  });

  it("skips processing checkout.session.completed when tenantId is missing", async () => {
    const session = { metadata: {}, subscription: "sub_abc", customer: "cus_abc" };
    mockConstructEvent.mockReturnValue(makeStripeEvent("checkout.session.completed", session));

    const res = await app.inject({
      method: "POST", url: "/stripe",
      headers: { "stripe-signature": "sig", "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(res.statusCode).toBe(200);
    expect(mockSubUpdate).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.updated", async () => {
    const sub = makeStripeSub({ status: "past_due", metadata: { tenantId: "t-1" } });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.updated", sub));

    const res = await app.inject({
      method: "POST", url: "/stripe",
      headers: { "stripe-signature": "sig", "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(res.statusCode).toBe(200);
    expect(mockSubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-1" },
        data: expect.objectContaining({ status: "PAST_DUE" }),
      })
    );
  });

  it("maps Stripe status 'active' → 'ACTIVE' on subscription update", async () => {
    const sub = makeStripeSub({ status: "active", metadata: { tenantId: "t-1" } });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.updated", sub));

    await app.inject({
      method: "POST", url: "/stripe",
      headers: { "stripe-signature": "sig", "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(mockSubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) })
    );
  });

  it("handles customer.subscription.deleted — resets to STARTER/CANCELED", async () => {
    const sub = makeStripeSub({ metadata: { tenantId: "t-1" } });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.deleted", sub));

    const res = await app.inject({
      method: "POST", url: "/stripe",
      headers: { "stripe-signature": "sig", "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(res.statusCode).toBe(200);
    expect(mockSubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { tier: "STARTER", status: "CANCELED" },
      })
    );
  });

  it("skips processing subscription.deleted when tenantId is missing", async () => {
    const sub = makeStripeSub({ metadata: {} });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.deleted", sub));

    await app.inject({
      method: "POST", url: "/stripe",
      headers: { "stripe-signature": "sig", "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(mockSubUpdate).not.toHaveBeenCalled();
  });

  it("returns received:true for unknown event types", async () => {
    mockConstructEvent.mockReturnValue(makeStripeEvent("payment_intent.succeeded", {}));

    const res = await app.inject({
      method: "POST", url: "/stripe",
      headers: { "stripe-signature": "sig", "content-type": "application/json" },
      payload: Buffer.from("{}"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
    expect(mockSubUpdate).not.toHaveBeenCalled();
  });
});
