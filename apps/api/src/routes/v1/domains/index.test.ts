import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import { domainsRoutes } from "./index";
import type { FastifyInstance } from "fastify";

// ─── Queue mock (imported at module top-level by the route file) ───────────────
const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("../../../queues", () => ({ DnsProvisionQueue: { add: mockQueueAdd } }));

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockDomainFindMany   = vi.fn();
const mockDomainFindFirst  = vi.fn();
const mockDomainCreate     = vi.fn();
const mockDomainDelete     = vi.fn();
const mockDomainCount      = vi.fn();
const mockAuditLogCreate   = vi.fn();

function makePrisma() {
  return {
    domain:   {
      findMany:  mockDomainFindMany,
      findFirst: mockDomainFindFirst,
      create:    mockDomainCreate,
      delete:    mockDomainDelete,
      count:     mockDomainCount,
    },
    auditLog: { create: mockAuditLogCreate },
  };
}

function makeDomain(overrides?: object) {
  return { id: "d-1", name: "example.com", tenantId: "t-1", status: "PENDING", ...overrides };
}

let app: FastifyInstance;
const CTX = makeCtx();

beforeEach(async () => {
  vi.clearAllMocks();
  mockAuditLogCreate.mockResolvedValue({});
  mockQueueAdd.mockResolvedValue({});
  app = await buildRouteApp(domainsRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET / ─────────────────────────────────────────────────────────────────────
describe("GET /", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(domainsRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns the tenant's domains", async () => {
    mockDomainFindMany.mockResolvedValue([makeDomain()]);
    const body = (await app.inject({ method: "GET", url: "/" })).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("example.com");
  });

  it("queries only domains belonging to the current tenant", async () => {
    mockDomainFindMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/" });
    expect(mockDomainFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "t-1" }) })
    );
  });
});

// ─── POST / ────────────────────────────────────────────────────────────────────
describe("POST /", () => {
  it("returns 400 for an invalid domain name", async () => {
    const res = await app.inject({
      method: "POST", url: "/",
      payload: { name: "not a domain!" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates a domain and returns 201", async () => {
    mockDomainCount.mockResolvedValue(0);
    mockDomainCreate.mockResolvedValue(makeDomain());

    const res = await app.inject({
      method: "POST", url: "/",
      payload: { name: "example.com" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe("example.com");
  });

  it("lowercases the domain name on create", async () => {
    mockDomainCount.mockResolvedValue(0);
    mockDomainCreate.mockResolvedValue(makeDomain({ name: "example.com" }));

    await app.inject({ method: "POST", url: "/", payload: { name: "EXAMPLE.COM" } });

    expect(mockDomainCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "example.com" }) })
    );
  });

  it("returns 403 when the tenant has reached its domain limit (STARTER = 3)", async () => {
    const starterCtx = makeCtx({ subscription: { tier: "STARTER", status: "ACTIVE" } });
    const starterApp = await buildRouteApp(domainsRoutes, { prisma: makePrisma(), ctx: starterCtx });
    mockDomainCount.mockResolvedValue(3); // already at STARTER limit (maxDomains = 3)

    const res = await starterApp.inject({
      method: "POST", url: "/",
      payload: { name: "newdomain.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("domain_limit_reached");
    await starterApp.close();
  });

  it("writes an audit log entry after creating a domain", async () => {
    mockDomainCount.mockResolvedValue(0);
    mockDomainCreate.mockResolvedValue(makeDomain());

    await app.inject({ method: "POST", url: "/", payload: { name: "example.com" } });

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DOMAIN_ADDED" }) })
    );
  });
});

// ─── GET /:domainId ────────────────────────────────────────────────────────────
describe("GET /:domainId", () => {
  it("returns the domain details", async () => {
    mockDomainFindFirst.mockResolvedValue(makeDomain());
    const body = (await app.inject({ method: "GET", url: "/d-1" })).json();
    expect(body.data.id).toBe("d-1");
  });

  it("returns 404 when domain does not belong to the tenant", async () => {
    mockDomainFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/d-other" });
    expect(res.statusCode).toBe(404);
  });
});

// ─── DELETE /:domainId ─────────────────────────────────────────────────────────
describe("DELETE /:domainId", () => {
  it("returns 204 on successful deletion", async () => {
    mockDomainFindFirst.mockResolvedValue(makeDomain());
    mockDomainDelete.mockResolvedValue({});

    const res = await app.inject({ method: "DELETE", url: "/d-1" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when domain is not found", async () => {
    mockDomainFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/d-missing" });
    expect(res.statusCode).toBe(404);
  });

  it("writes an audit log entry after deletion", async () => {
    mockDomainFindFirst.mockResolvedValue(makeDomain());
    mockDomainDelete.mockResolvedValue({});

    await app.inject({ method: "DELETE", url: "/d-1" });

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DOMAIN_REMOVED" }) })
    );
  });
});

// ─── POST /:domainId/verify ────────────────────────────────────────────────────
describe("POST /:domainId/verify", () => {
  it("queues a verify-domain job and returns 200", async () => {
    mockDomainFindFirst.mockResolvedValue(makeDomain());

    const res = await app.inject({ method: "POST", url: "/d-1/verify" });
    expect(res.statusCode).toBe(200);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "verify-domain",
      expect.objectContaining({ domainId: "d-1" })
    );
  });

  it("returns 404 when domain is not found", async () => {
    mockDomainFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/d-missing/verify" });
    expect(res.statusCode).toBe(404);
  });
});
