import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import { teamRoutes } from "./index";
import type { FastifyInstance } from "fastify";

// ─── bcrypt mock ───────────────────────────────────────────────────────────────
const mockBcryptHash = vi.hoisted(() => vi.fn().mockResolvedValue("hashed_temp"));
vi.mock("bcryptjs", () => ({ default: { hash: mockBcryptHash } }));

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockMemberFindMany   = vi.fn();
const mockMemberCount      = vi.fn();
const mockMemberFindUnique = vi.fn();
const mockMemberCreate     = vi.fn();
const mockMemberUpdate     = vi.fn();
const mockMemberDelete     = vi.fn();
const mockUserFindUnique   = vi.fn();
const mockUserCreate       = vi.fn();
const mockAuditLogCreate   = vi.fn();
const mockTransaction      = vi.fn();

function makePrisma() {
  return {
    tenantMember: {
      findMany:   mockMemberFindMany,
      count:      mockMemberCount,
      findUnique: mockMemberFindUnique,
      create:     mockMemberCreate,
      update:     mockMemberUpdate,
      delete:     mockMemberDelete,
    },
    user:     { findUnique: mockUserFindUnique, create: mockUserCreate },
    auditLog: { create: mockAuditLogCreate },
    $transaction: mockTransaction,
  };
}

function makeMember(overrides?: object) {
  return {
    id: "m-1", tenantId: "t-1", userId: "u-1", role: "MEMBER", joinedAt: new Date(),
    user: { id: "u-1", name: "Test User", email: "user@test.com", createdAt: new Date() },
    ...overrides,
  };
}

let app: FastifyInstance;
const CTX = makeCtx(); // OWNER role by default

beforeEach(async () => {
  vi.clearAllMocks();
  mockAuditLogCreate.mockResolvedValue({});
  app = await buildRouteApp(teamRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET / ─────────────────────────────────────────────────────────────────────
describe("GET /", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(teamRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns the tenant's members", async () => {
    mockMemberFindMany.mockResolvedValue([makeMember()]);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});

// ─── POST /invite ──────────────────────────────────────────────────────────────
describe("POST /invite", () => {
  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(teamRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "POST", url: "/invite", payload: { email: "a@b.com" } });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("returns 403 when caller is a MEMBER (not OWNER/ADMIN)", async () => {
    const memberCtx = makeCtx({ member: { tenantId: "t-1", userId: "u-1", role: "MEMBER", joinedAt: new Date() } });
    const memberApp = await buildRouteApp(teamRoutes, { prisma: makePrisma(), ctx: memberCtx });
    const res = await memberApp.inject({
      method: "POST", url: "/invite",
      payload: { email: "new@example.com" },
    });
    expect(res.statusCode).toBe(403);
    await memberApp.close();
  });

  it("returns 400 for an invalid email", async () => {
    const res = await app.inject({
      method: "POST", url: "/invite",
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 when seat limit is reached (STARTER = 2 seats)", async () => {
    const starterCtx = makeCtx({ subscription: { tier: "STARTER", status: "ACTIVE" } });
    const starterApp = await buildRouteApp(teamRoutes, { prisma: makePrisma(), ctx: starterCtx });
    mockMemberCount.mockResolvedValue(2); // at STARTER limit (maxSeats = 2)

    const res = await starterApp.inject({
      method: "POST", url: "/invite",
      payload: { email: "new@example.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("Seat limit");
    await starterApp.close();
  });

  it("returns 409 when user is already a member", async () => {
    mockMemberCount.mockResolvedValue(0);
    mockUserFindUnique.mockResolvedValue({ id: "u-existing" });
    mockMemberFindUnique.mockResolvedValue(makeMember({ userId: "u-existing" }));

    const res = await app.inject({
      method: "POST", url: "/invite",
      payload: { email: "existing@example.com" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("adds an existing user to the tenant if not already a member", async () => {
    mockMemberCount.mockResolvedValue(1);
    mockUserFindUnique.mockResolvedValue({ id: "u-existing", email: "other@example.com" });
    mockMemberFindUnique.mockResolvedValue(null); // not yet a member
    mockMemberCreate.mockResolvedValue(makeMember({ userId: "u-existing" }));

    const res = await app.inject({
      method: "POST", url: "/invite",
      payload: { email: "other@example.com", role: "ADMIN" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockUserCreate).not.toHaveBeenCalled(); // no new user creation
  });

  it("creates a new user and member via transaction when user does not exist", async () => {
    mockMemberCount.mockResolvedValue(0);
    mockUserFindUnique.mockResolvedValue(null); // new user
    mockTransaction.mockImplementation(async (fn: Function) => {
      return fn({
        user:         { create: vi.fn().mockResolvedValue({ id: "u-new", email: "new@example.com", name: "new" }) },
        tenantMember: { create: vi.fn().mockResolvedValue({ id: "m-new", role: "MEMBER" }) },
      });
    });

    const res = await app.inject({
      method: "POST", url: "/invite",
      payload: { email: "new@example.com" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.tempPassword).toBeTruthy();
    expect(body.note).toContain("temporary password");
  });

  it("hashes the temporary password with bcrypt", async () => {
    mockMemberCount.mockResolvedValue(0);
    mockUserFindUnique.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (fn: Function) => {
      return fn({
        user:         { create: vi.fn().mockResolvedValue({ id: "u-new", email: "new@example.com", name: "new" }) },
        tenantMember: { create: vi.fn().mockResolvedValue({ id: "m-new", role: "MEMBER" }) },
      });
    });

    await app.inject({ method: "POST", url: "/invite", payload: { email: "new@example.com" } });
    expect(mockBcryptHash).toHaveBeenCalledWith(expect.any(String), 12);
  });
});

// ─── PATCH /:memberId ──────────────────────────────────────────────────────────
describe("PATCH /:memberId", () => {
  it("returns 403 when caller is a MEMBER", async () => {
    const memberCtx = makeCtx({ member: { tenantId: "t-1", userId: "u-1", role: "MEMBER", joinedAt: new Date() } });
    const memberApp = await buildRouteApp(teamRoutes, { prisma: makePrisma(), ctx: memberCtx });
    const res = await memberApp.inject({
      method: "PATCH", url: "/m-1",
      payload: { role: "ADMIN" },
    });
    expect(res.statusCode).toBe(403);
    await memberApp.close();
  });

  it("returns 400 for an invalid role", async () => {
    const res = await app.inject({
      method: "PATCH", url: "/m-1",
      payload: { role: "OWNER" }, // only MEMBER/ADMIN allowed
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when member is not found", async () => {
    mockMemberFindUnique.mockResolvedValue(null);
    const res = await app.inject({ method: "PATCH", url: "/m-missing", payload: { role: "ADMIN" } });
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 when trying to change the OWNER's role", async () => {
    mockMemberFindUnique.mockResolvedValue(makeMember({ role: "OWNER" }));
    const res = await app.inject({ method: "PATCH", url: "/m-1", payload: { role: "ADMIN" } });
    expect(res.statusCode).toBe(403);
  });

  it("updates member role and returns the updated member", async () => {
    mockMemberFindUnique.mockResolvedValue(makeMember({ role: "MEMBER" }));
    mockMemberUpdate.mockResolvedValue(makeMember({ role: "ADMIN" }));

    const res = await app.inject({ method: "PATCH", url: "/m-1", payload: { role: "ADMIN" } });
    expect(res.statusCode).toBe(200);
    expect(mockMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "ADMIN" } })
    );
  });
});

// ─── DELETE /:memberId ─────────────────────────────────────────────────────────
describe("DELETE /:memberId", () => {
  it("returns 403 when caller is a MEMBER", async () => {
    const memberCtx = makeCtx({ member: { tenantId: "t-1", userId: "u-1", role: "MEMBER", joinedAt: new Date() } });
    const memberApp = await buildRouteApp(teamRoutes, { prisma: makePrisma(), ctx: memberCtx });
    const res = await memberApp.inject({ method: "DELETE", url: "/m-other" });
    expect(res.statusCode).toBe(403);
    await memberApp.close();
  });

  it("returns 404 when member is not found", async () => {
    mockMemberFindUnique.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/m-missing" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 when trying to remove the OWNER", async () => {
    mockMemberFindUnique.mockResolvedValue(makeMember({ role: "OWNER" }));
    const res = await app.inject({ method: "DELETE", url: "/m-1" });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when trying to remove yourself", async () => {
    // CTX user id is "u-1", so removing member with userId "u-1" is self-removal
    mockMemberFindUnique.mockResolvedValue(makeMember({ userId: "u-1", role: "MEMBER" }));
    const res = await app.inject({ method: "DELETE", url: "/m-1" });
    expect(res.statusCode).toBe(403);
  });

  it("removes the member and returns 204", async () => {
    mockMemberFindUnique.mockResolvedValue(makeMember({ userId: "u-other", role: "MEMBER" }));
    mockMemberDelete.mockResolvedValue({});

    const res = await app.inject({ method: "DELETE", url: "/m-1" });
    expect(res.statusCode).toBe(204);
    expect(mockMemberDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m-1" } })
    );
  });

  it("writes an audit log entry after removing a member", async () => {
    mockMemberFindUnique.mockResolvedValue(makeMember({ userId: "u-other", role: "MEMBER" }));
    mockMemberDelete.mockResolvedValue({});

    await app.inject({ method: "DELETE", url: "/m-1" });
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "team.remove" }) })
    );
  });
});
