import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import { webhookEndpointsRoutes } from "./endpoints";
import type { FastifyInstance } from "fastify";

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockWebhookFindMany       = vi.fn();
const mockWebhookCreate         = vi.fn();
const mockWebhookDelete         = vi.fn();
const mockDeliveryFindMany      = vi.fn();

function makePrisma() {
  return {
    webhook:         { findMany: mockWebhookFindMany, create: mockWebhookCreate, delete: mockWebhookDelete },
    webhookDelivery: { findMany: mockDeliveryFindMany },
  };
}

function makeHook(overrides?: object) {
  return {
    id: "wh-1", url: "https://example.com/webhook", events: ["email.sent"],
    enabled: true, tenantId: "t-1", secret: "whsec_xxx", _count: { deliveries: 5 },
    ...overrides,
  };
}

// GROWTH tier has webhooks = true
let app: FastifyInstance;
const CTX = makeCtx(); // GROWTH by default

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildRouteApp(webhookEndpointsRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET /endpoints ────────────────────────────────────────────────────────────
describe("GET /endpoints", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(webhookEndpointsRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/endpoints" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns 403 for STARTER tier (webhooks not available)", async () => {
    const starterCtx = makeCtx({ subscription: { tier: "STARTER", status: "ACTIVE" } });
    const starterApp = await buildRouteApp(webhookEndpointsRoutes, { prisma: makePrisma(), ctx: starterCtx });
    const res = await starterApp.inject({ method: "GET", url: "/endpoints" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("feature_not_available");
    await starterApp.close();
  });

  it("returns the tenant's webhook endpoints", async () => {
    mockWebhookFindMany.mockResolvedValue([makeHook()]);
    const res = await app.inject({ method: "GET", url: "/endpoints" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].url).toBe("https://example.com/webhook");
  });
});

// ─── POST /endpoints ───────────────────────────────────────────────────────────
describe("POST /endpoints", () => {
  it("returns 403 for STARTER tier", async () => {
    const starterCtx = makeCtx({ subscription: { tier: "STARTER", status: "ACTIVE" } });
    const starterApp = await buildRouteApp(webhookEndpointsRoutes, { prisma: makePrisma(), ctx: starterCtx });
    const res = await starterApp.inject({
      method: "POST", url: "/endpoints",
      payload: { url: "https://example.com/wh", events: ["email.sent"] },
    });
    expect(res.statusCode).toBe(403);
    await starterApp.close();
  });

  it("returns 400 for missing events", async () => {
    const res = await app.inject({
      method: "POST", url: "/endpoints",
      payload: { url: "https://example.com/wh", events: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid event types", async () => {
    const res = await app.inject({
      method: "POST", url: "/endpoints",
      payload: { url: "https://example.com/wh", events: ["invalid.event"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an invalid URL", async () => {
    const res = await app.inject({
      method: "POST", url: "/endpoints",
      payload: { url: "not-a-url", events: ["email.sent"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates a webhook endpoint and returns 201 with signing secret", async () => {
    mockWebhookCreate.mockResolvedValue(makeHook({ id: "wh-new" }));
    const res = await app.inject({
      method: "POST", url: "/endpoints",
      payload: { url: "https://example.com/wh", events: ["email.sent", "email.bounced"] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.secret).toMatch(/^whsec_/);
    expect(body.warning).toContain("not be shown again");
    expect(body.data.id).toBe("wh-new");
  });

  it("accepts the wildcard event '*'", async () => {
    mockWebhookCreate.mockResolvedValue(makeHook());
    const res = await app.inject({
      method: "POST", url: "/endpoints",
      payload: { url: "https://example.com/wh", events: ["*"] },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─── DELETE /endpoints/:webhookId ──────────────────────────────────────────────
describe("DELETE /endpoints/:webhookId", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(webhookEndpointsRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "DELETE", url: "/endpoints/wh-1" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("deletes the webhook and returns 204", async () => {
    mockWebhookDelete.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/endpoints/wh-1" });
    expect(res.statusCode).toBe(204);
    expect(mockWebhookDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "wh-1", tenantId: "t-1" }) })
    );
  });
});

// ─── GET /endpoints/:webhookId/deliveries ──────────────────────────────────────
describe("GET /endpoints/:webhookId/deliveries", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(webhookEndpointsRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/endpoints/wh-1/deliveries" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns the delivery history for a webhook", async () => {
    mockDeliveryFindMany.mockResolvedValue([
      { id: "del-1", status: "SUCCESS", createdAt: new Date() },
    ]);
    const res = await app.inject({ method: "GET", url: "/endpoints/wh-1/deliveries" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});
