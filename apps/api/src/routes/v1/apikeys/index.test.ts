import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import { apiKeysRoutes } from "./index";
import type { FastifyInstance } from "fastify";

// ─── bcrypt mock ───────────────────────────────────────────────────────────────
const mockBcryptHash = vi.hoisted(() => vi.fn().mockResolvedValue("hashed_key"));
vi.mock("bcryptjs", () => ({ default: { hash: mockBcryptHash } }));

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockApiKeyFindMany  = vi.fn();
const mockApiKeyCreate    = vi.fn();
const mockApiKeyUpdate    = vi.fn();
const mockAuditLogCreate  = vi.fn();

function makePrisma() {
  return {
    apiKey:   { findMany: mockApiKeyFindMany, create: mockApiKeyCreate, update: mockApiKeyUpdate },
    auditLog: { create: mockAuditLogCreate },
  };
}

function makeKey(overrides?: object) {
  return {
    id: "key-1", name: "My Key", keyPrefix: "mw_live_abcd",
    scopes: ["read", "write"], lastUsedAt: null, expiresAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

let app: FastifyInstance;
const CTX = makeCtx();

beforeEach(async () => {
  vi.clearAllMocks();
  mockAuditLogCreate.mockResolvedValue({});
  app = await buildRouteApp(apiKeysRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET / ─────────────────────────────────────────────────────────────────────
describe("GET /", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(apiKeysRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns the tenant's active API keys", async () => {
    mockApiKeyFindMany.mockResolvedValue([makeKey()]);
    const body = (await app.inject({ method: "GET", url: "/" })).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("My Key");
  });

  it("queries only non-revoked keys for the current tenant", async () => {
    mockApiKeyFindMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/" });
    expect(mockApiKeyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t-1", revokedAt: null }),
      })
    );
  });
});

// ─── POST / ────────────────────────────────────────────────────────────────────
describe("POST /", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(apiKeysRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "POST", url: "/", payload: { name: "k" } });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns 400 when name is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("creates a key and returns 201 with plaintext key", async () => {
    mockApiKeyCreate.mockResolvedValue(makeKey({ id: "key-new" }));

    const res = await app.inject({
      method: "POST", url: "/",
      payload: { name: "CI Key", scopes: ["read"] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.key).toMatch(/^mw_live_/);
    expect(body.data.id).toBe("key-new");
    expect(body.warning).toContain("not be shown again");
  });

  it("hashes the key before storing", async () => {
    mockApiKeyCreate.mockResolvedValue(makeKey());
    await app.inject({ method: "POST", url: "/", payload: { name: "k" } });
    expect(mockBcryptHash).toHaveBeenCalledWith(expect.stringMatching(/^mw_live_/), 10);
  });

  it("writes an audit log entry after creating the key", async () => {
    mockApiKeyCreate.mockResolvedValue(makeKey());
    await app.inject({ method: "POST", url: "/", payload: { name: "k" } });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "API_KEY_CREATED" }) })
    );
  });

  it("stores only the first 12 characters as keyPrefix", async () => {
    mockApiKeyCreate.mockResolvedValue(makeKey());
    await app.inject({ method: "POST", url: "/", payload: { name: "k" } });
    expect(mockApiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ keyPrefix: expect.stringMatching(/^mw_live_/) }),
      })
    );
    const call = mockApiKeyCreate.mock.calls[0][0];
    expect(call.data.keyPrefix).toHaveLength(12);
  });
});

// ─── DELETE /:keyId ────────────────────────────────────────────────────────────
describe("DELETE /:keyId", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(apiKeysRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "DELETE", url: "/key-1" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("revokes the key and returns 204", async () => {
    mockApiKeyUpdate.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/key-1" });
    expect(res.statusCode).toBe(204);
    expect(mockApiKeyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    );
  });

  it("writes an audit log entry on revoke", async () => {
    mockApiKeyUpdate.mockResolvedValue({});
    await app.inject({ method: "DELETE", url: "/key-1" });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "API_KEY_REVOKED" }) })
    );
  });
});
