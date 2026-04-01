import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import { analyticsRoutes } from "./index";
import type { FastifyInstance } from "fastify";

const mockGroupBy   = vi.fn();
const mockFindMany  = vi.fn();
const mockDomains   = vi.fn();
const mockDmarcFind = vi.fn();

function makePrisma() {
  return {
    emailEvent: { groupBy: mockGroupBy, findMany: mockFindMany },
    domain:     { findMany: mockDomains },
    dmarcReport: { findMany: mockDmarcFind },
  };
}

const FROM = "2026-01-01T00:00:00.000Z";
const TO   = "2026-01-31T23:59:59.000Z";

let app: FastifyInstance;
const CTX = makeCtx();

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildRouteApp(analyticsRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET /metrics ──────────────────────────────────────────────────────────────
describe("GET /metrics", () => {
  it("returns 401 when tenantCtx is missing", async () => {
    const unauthed = await buildRouteApp(analyticsRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: `/metrics?from=${FROM}&to=${TO}` });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns 400 when date params are missing", async () => {
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(400);
  });

  it("returns zero rates when there are no events", async () => {
    mockGroupBy.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: `/metrics?from=${FROM}&to=${TO}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.sent).toBe(0);
    expect(body.data.openRate).toBe(0);
    expect(body.data.bounceRate).toBe(0);
  });

  it("calculates openRate correctly", async () => {
    mockGroupBy.mockResolvedValue([
      { type: "SENT",   _count: { type: 100 } },
      { type: "OPENED", _count: { type: 35  } },
    ]);
    const res = await app.inject({ method: "GET", url: `/metrics?from=${FROM}&to=${TO}` });
    expect(res.json().data.openRate).toBe(35);
  });

  it("calculates bounceRate correctly", async () => {
    mockGroupBy.mockResolvedValue([
      { type: "SENT",    _count: { type: 200 } },
      { type: "BOUNCED", _count: { type: 10  } },
    ]);
    const res = await app.inject({ method: "GET", url: `/metrics?from=${FROM}&to=${TO}` });
    expect(res.json().data.bounceRate).toBe(5);
  });

  it("returns all event type counts in the response", async () => {
    mockGroupBy.mockResolvedValue([
      { type: "SENT",      _count: { type: 50 } },
      { type: "DELIVERED", _count: { type: 48 } },
      { type: "OPENED",    _count: { type: 20 } },
      { type: "CLICKED",   _count: { type: 5  } },
      { type: "BOUNCED",   _count: { type: 2  } },
      { type: "REPLIED",   _count: { type: 3  } },
    ]);
    const body = (await app.inject({ method: "GET", url: `/metrics?from=${FROM}&to=${TO}` })).json();
    expect(body.data.delivered).toBe(48);
    expect(body.data.clicked).toBe(5);
    expect(body.data.replied).toBe(3);
  });

  it("filters by domainId when supplied", async () => {
    mockGroupBy.mockResolvedValue([]);
    await app.inject({ method: "GET", url: `/metrics?from=${FROM}&to=${TO}&domainId=cld1234567890abc` });
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ domainId: "cld1234567890abc" }),
      })
    );
  });
});

// ─── GET /timeseries ───────────────────────────────────────────────────────────
describe("GET /timeseries", () => {
  it("returns 400 when date params are missing", async () => {
    const res = await app.inject({ method: "GET", url: "/timeseries" });
    expect(res.statusCode).toBe(400);
  });

  it("groups events by date string", async () => {
    mockFindMany.mockResolvedValue([
      { type: "SENT",   occurredAt: new Date("2026-01-05T12:00:00Z") },
      { type: "SENT",   occurredAt: new Date("2026-01-05T14:00:00Z") },
      { type: "OPENED", occurredAt: new Date("2026-01-05T15:00:00Z") },
      { type: "SENT",   occurredAt: new Date("2026-01-06T08:00:00Z") },
    ]);

    const body = (await app.inject({ method: "GET", url: `/timeseries?from=${FROM}&to=${TO}` })).json();
    const jan5 = body.data.find((d: any) => d.date === "2026-01-05");
    expect(jan5?.SENT).toBe(2);
    expect(jan5?.OPENED).toBe(1);
    expect(body.data.find((d: any) => d.date === "2026-01-06")?.SENT).toBe(1);
  });

  it("returns an empty array when there are no events", async () => {
    mockFindMany.mockResolvedValue([]);
    const body = (await app.inject({ method: "GET", url: `/timeseries?from=${FROM}&to=${TO}` })).json();
    expect(body.data).toEqual([]);
  });
});

// ─── GET /domains ──────────────────────────────────────────────────────────────
describe("GET /domains", () => {
  it("returns the domain deliverability list", async () => {
    mockDomains.mockResolvedValue([
      { id: "d-1", name: "example.com", status: "WARMING", reputationScore: 72,
        warmingSchedule: { status: "ACTIVE", currentDay: 5, targetDailyVolume: 100 },
        _count: { emailEvents: 500, mailboxes: 3 } },
    ]);
    const body = (await app.inject({ method: "GET", url: "/domains" })).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("example.com");
    expect(body.data[0].reputationScore).toBe(72);
  });

  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(analyticsRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/domains" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });
});

// ─── GET /dmarc ────────────────────────────────────────────────────────────────
describe("GET /dmarc", () => {
  it("returns DMARC reports for the tenant", async () => {
    mockDmarcFind.mockResolvedValue([{ id: "rpt-1", domain: "example.com", passCount: 100, failCount: 2 }]);
    const body = (await app.inject({ method: "GET", url: "/dmarc" })).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].passCount).toBe(100);
  });

  it("filters by domainName when provided", async () => {
    mockDmarcFind.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/dmarc?domainName=example.com" });
    expect(mockDmarcFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ domain: "example.com" }) })
    );
  });
});
