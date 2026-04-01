import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import type { FastifyInstance } from "fastify";

// ─── Stripe mock ───────────────────────────────────────────────────────────────
// Must be hoisted so it's available when the module initialises `new Stripe()`
const mockCustomersCreate          = vi.hoisted(() => vi.fn());
const mockCheckoutSessionsCreate   = vi.hoisted(() => vi.fn());
const mockBillingPortalCreate      = vi.hoisted(() => vi.fn());
const mockSubscriptionUpdate       = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    this.customers = { create: mockCustomersCreate };
    this.checkout  = { sessions: { create: mockCheckoutSessionsCreate } };
    this.billingPortal = { sessions: { create: mockBillingPortalCreate } };
    this.subscriptions = { update: mockSubscriptionUpdate };
  }),
}));

// Import AFTER mock is set up
import { billingRoutes } from "./index";

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockSubFindUnique = vi.fn();
const mockSubUpdate     = vi.fn();

function makePrisma() {
  return {
    subscription: { findUnique: mockSubFindUnique, update: mockSubUpdate },
  };
}

function makeSub(overrides?: object) {
  return { tenantId: "t-1", tier: "GROWTH", status: "ACTIVE", stripeCustomerId: "cus_abc", ...overrides };
}

let app: FastifyInstance;
const CTX = makeCtx();

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildRouteApp(billingRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET /subscription ─────────────────────────────────────────────────────────
describe("GET /subscription", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(billingRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/subscription" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns the tenant's subscription details", async () => {
    mockSubFindUnique.mockResolvedValue(makeSub());
    const res = await app.inject({ method: "GET", url: "/subscription" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.tier).toBe("GROWTH");
  });
});

// ─── POST /checkout ────────────────────────────────────────────────────────────
describe("POST /checkout", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(billingRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "POST", url: "/checkout", payload: { tier: "PRO" } });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns 400 for an invalid tier", async () => {
    const res = await app.inject({
      method: "POST", url: "/checkout",
      payload: { tier: "INVALID" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reuses existing Stripe customer when stripeCustomerId is present", async () => {
    mockSubFindUnique.mockResolvedValue(makeSub({ stripeCustomerId: "cus_existing" }));
    mockCheckoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/abc" });

    const res = await app.inject({
      method: "POST", url: "/checkout",
      payload: { tier: "PRO" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(res.json().url).toContain("stripe.com");
  });

  it("creates a new Stripe customer when none exists", async () => {
    mockSubFindUnique.mockResolvedValue(makeSub({ stripeCustomerId: null }));
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    mockSubUpdate.mockResolvedValue({});
    mockCheckoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/new" });

    const res = await app.inject({
      method: "POST", url: "/checkout",
      payload: { tier: "PRO" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@test.com" })
    );
    expect(mockSubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeCustomerId: "cus_new" }) })
    );
  });

  it("passes tenantId and tier in checkout metadata", async () => {
    mockSubFindUnique.mockResolvedValue(makeSub({ stripeCustomerId: "cus_abc" }));
    mockCheckoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

    await app.inject({ method: "POST", url: "/checkout", payload: { tier: "STARTER" } });

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ tenantId: "t-1", tier: "STARTER" }) })
    );
  });
});

// ─── POST /portal ──────────────────────────────────────────────────────────────
describe("POST /portal", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(billingRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "POST", url: "/portal" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns 400 when no Stripe customer exists", async () => {
    mockSubFindUnique.mockResolvedValue(makeSub({ stripeCustomerId: null }));
    const res = await app.inject({ method: "POST", url: "/portal" });
    expect(res.statusCode).toBe(400);
  });

  it("creates a billing portal session and returns the URL", async () => {
    mockSubFindUnique.mockResolvedValue(makeSub({ stripeCustomerId: "cus_abc" }));
    mockBillingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/portal" });

    const res = await app.inject({ method: "POST", url: "/portal" });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain("stripe.com");
    expect(mockBillingPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_abc" })
    );
  });
});
