import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import { mailboxesRoutes } from "./index";
import type { FastifyInstance } from "fastify";

// ─── Queue mock ────────────────────────────────────────────────────────────────
const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("../../../queues", () => ({ MailboxProvisionQueue: { add: mockQueueAdd } }));

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockMailboxFindMany  = vi.fn();
const mockMailboxFindFirst = vi.fn();
const mockMailboxCreate    = vi.fn();
const mockMailboxUpdate    = vi.fn();
const mockMailboxCount     = vi.fn();
const mockDomainFindFirst  = vi.fn();
const mockAuditLogCreate   = vi.fn();

function makePrisma() {
  return {
    mailbox:  {
      findMany:  mockMailboxFindMany,
      findFirst: mockMailboxFindFirst,
      create:    mockMailboxCreate,
      update:    mockMailboxUpdate,
      count:     mockMailboxCount,
    },
    domain:   { findFirst: mockDomainFindFirst },
    auditLog: { create: mockAuditLogCreate },
  };
}

function makeDomain(overrides?: object) {
  return { id: "d-1", name: "example.com", tenantId: "t-1", ...overrides };
}

function makeMailbox(overrides?: object) {
  return { id: "mb-1", address: "warm1@example.com", domainId: "d-1", status: "ACTIVE", ...overrides };
}

let app: FastifyInstance;
const CTX = makeCtx();

// Use a valid CUID for domainId in request bodies
const VALID_CUID = "cld1234567890abcdef12345";

beforeEach(async () => {
  vi.clearAllMocks();
  mockAuditLogCreate.mockResolvedValue({});
  mockQueueAdd.mockResolvedValue({});
  app = await buildRouteApp(mailboxesRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET / ─────────────────────────────────────────────────────────────────────
describe("GET /", () => {
  it("returns the tenant's mailboxes", async () => {
    mockMailboxFindMany.mockResolvedValue([makeMailbox()]);
    const body = (await app.inject({ method: "GET", url: "/" })).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].address).toBe("warm1@example.com");
  });

  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(mailboxesRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });

  it("filters by domainId when provided", async () => {
    mockMailboxFindMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: `/?domainId=${VALID_CUID}` });
    expect(mockMailboxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ domainId: VALID_CUID }) })
    );
  });
});

// ─── POST / ────────────────────────────────────────────────────────────────────
describe("POST /", () => {
  it("returns 400 for an invalid (non-CUID) domainId", async () => {
    const res = await app.inject({
      method: "POST", url: "/",
      payload: { domainId: "not-a-cuid" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when domain is not found or belongs to another tenant", async () => {
    mockDomainFindFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST", url: "/",
      payload: { domainId: VALID_CUID },
    });
    expect(res.statusCode).toBe(404);
  });

  it("creates a mailbox with the correct address pattern", async () => {
    mockDomainFindFirst.mockResolvedValue(makeDomain({ id: VALID_CUID, name: "example.com" }));
    mockMailboxCount.mockResolvedValue(2); // warm3 will be next
    mockMailboxCreate.mockResolvedValue(makeMailbox({ address: "warm3@example.com" }));

    const res = await app.inject({
      method: "POST", url: "/",
      payload: { domainId: VALID_CUID },
    });

    expect(res.statusCode).toBe(201);
    expect(mockMailboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ address: "warm3@example.com", status: "PROVISIONING" }),
      })
    );
  });

  it("queues a provision job after creating the mailbox", async () => {
    mockDomainFindFirst.mockResolvedValue(makeDomain({ id: VALID_CUID }));
    mockMailboxCount.mockResolvedValue(0);
    mockMailboxCreate.mockResolvedValue(makeMailbox({ id: "mb-new" }));

    await app.inject({ method: "POST", url: "/", payload: { domainId: VALID_CUID } });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "provision",
      expect.objectContaining({ mailboxId: "mb-new" })
    );
  });

  it("returns 403 when the mailbox limit is reached", async () => {
    const starterCtx = makeCtx({ subscription: { tier: "STARTER", status: "ACTIVE" } });
    const starterApp = await buildRouteApp(mailboxesRoutes, { prisma: makePrisma(), ctx: starterCtx });
    mockDomainFindFirst.mockResolvedValue(makeDomain({ id: VALID_CUID }));
    mockMailboxCount.mockResolvedValue(2); // STARTER limit is 2 (maxMailboxesPerDomain = 2)

    const res = await starterApp.inject({
      method: "POST", url: "/",
      payload: { domainId: VALID_CUID },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("mailbox_limit_reached");
    await starterApp.close();
  });
});

// ─── DELETE /:mailboxId ────────────────────────────────────────────────────────
describe("DELETE /:mailboxId", () => {
  it("returns 204 and marks mailbox as DELETED", async () => {
    mockMailboxFindFirst.mockResolvedValue(makeMailbox());
    mockMailboxUpdate.mockResolvedValue({});

    const res = await app.inject({ method: "DELETE", url: "/mb-1" });

    expect(res.statusCode).toBe(204);
    expect(mockMailboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DELETED" } })
    );
  });

  it("queues a deprovision job after deleting", async () => {
    mockMailboxFindFirst.mockResolvedValue(makeMailbox({ id: "mb-1", address: "warm1@example.com" }));
    mockMailboxUpdate.mockResolvedValue({});

    await app.inject({ method: "DELETE", url: "/mb-1" });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "deprovision",
      expect.objectContaining({ mailboxId: "mb-1", address: "warm1@example.com" })
    );
  });

  it("returns 404 when mailbox is not found", async () => {
    mockMailboxFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/mb-missing" });
    expect(res.statusCode).toBe(404);
  });
});
