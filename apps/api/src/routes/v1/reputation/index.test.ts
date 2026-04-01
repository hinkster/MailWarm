import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import { reputationRoutes } from "./index";
import type { FastifyInstance } from "fastify";

// ─── Queue mock ────────────────────────────────────────────────────────────────
const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "job-1" }));
vi.mock("../../../queues", () => ({ ReputationCheckQueue: { add: mockQueueAdd } }));

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockDomainFindUnique      = vi.fn();
const mockRepCheckFindFirst     = vi.fn();
const mockRepCheckFindMany      = vi.fn();

function makePrisma() {
  return {
    domain:          { findUnique: mockDomainFindUnique },
    reputationCheck: { findFirst: mockRepCheckFindFirst, findMany: mockRepCheckFindMany },
  };
}

function makeDomain(overrides?: object) {
  return { id: "d-1", name: "example.com", tenantId: "t-1", reputationScore: 82, ...overrides };
}

function makeCheck(overrides?: object) {
  return { id: "rc-1", domainId: "d-1", score: 82, listedOn: [], checkedAt: new Date(), ...overrides };
}

let app: FastifyInstance;
const CTX = makeCtx();

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildRouteApp(reputationRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET /:domainId ────────────────────────────────────────────────────────────
describe("GET /:domainId", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(reputationRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/d-1" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns 404 when domain is not found or belongs to another tenant", async () => {
    mockDomainFindUnique.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/d-missing" });
    expect(res.statusCode).toBe(404);
  });

  it("returns latest check and history", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockRepCheckFindFirst.mockResolvedValue(makeCheck());
    mockRepCheckFindMany.mockResolvedValue([makeCheck(), makeCheck({ id: "rc-2" })]);

    const res = await app.inject({ method: "GET", url: "/d-1" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.latest.id).toBe("rc-1");
    expect(body.data.history).toHaveLength(2);
    expect(body.data.currentScore).toBe(82);
  });

  it("queries domain with tenant isolation", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockRepCheckFindFirst.mockResolvedValue(null);
    mockRepCheckFindMany.mockResolvedValue([]);

    await app.inject({ method: "GET", url: "/d-1" });
    expect(mockDomainFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "t-1" }) })
    );
  });
});

// ─── POST /:domainId/check ─────────────────────────────────────────────────────
describe("POST /:domainId/check", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(reputationRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "POST", url: "/d-1/check" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns 404 when domain is not found", async () => {
    mockDomainFindUnique.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/d-missing/check" });
    expect(res.statusCode).toBe(404);
  });

  it("queues a check job and returns 202", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain({ id: "d-1", name: "example.com" }));

    const res = await app.inject({ method: "POST", url: "/d-1/check" });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.jobId).toBe("job-1");
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "check",
      expect.objectContaining({ domainId: "d-1", domainName: "example.com" }),
      expect.any(Object)
    );
  });
});
