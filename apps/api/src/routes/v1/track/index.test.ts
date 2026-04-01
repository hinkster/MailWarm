import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp } from "../../../test-helpers/build-route-app";
import { trackingRoutes } from "./index";
import type { FastifyInstance } from "fastify";

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockDayLogUpdate    = vi.fn();
const mockEventFindFirst  = vi.fn();
const mockEventCreate     = vi.fn();

function makePrisma() {
  return {
    warmingDayLog: { update: mockDayLogUpdate },
    emailEvent:    { findFirst: mockEventFindFirst, create: mockEventCreate },
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────
let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockDayLogUpdate.mockResolvedValue({});
  mockEventCreate.mockResolvedValue({});
  app = await buildRouteApp(trackingRoutes, { prisma: makePrisma() });
});

afterEach(() => app.close());

// ─── GET /open ─────────────────────────────────────────────────────────────────
describe("GET /open", () => {
  it("returns a 200 with Content-Type image/gif", async () => {
    mockEventFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/open" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/gif");
  });

  it("returns the 1×1 tracking pixel body", async () => {
    mockEventFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/open" });
    // 1×1 transparent GIF is 42 bytes
    expect(res.rawPayload.length).toBe(42);
  });

  it("sets Cache-Control: no-store to prevent caching", async () => {
    mockEventFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/open" });
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("increments warmingDayLog.opened when lid is present", async () => {
    mockEventFindFirst.mockResolvedValue(null);
    await app.inject({ method: "GET", url: "/open?lid=dl-1" });
    expect(mockDayLogUpdate).toHaveBeenCalledWith({
      where: { id: "dl-1" },
      data:  { opened: { increment: 1 } },
    });
  });

  it("does not call dayLog.update when lid is absent", async () => {
    mockEventFindFirst.mockResolvedValue(null);
    await app.inject({ method: "GET", url: "/open?mid=msg-1" });
    expect(mockDayLogUpdate).not.toHaveBeenCalled();
  });

  it("creates an OPENED EmailEvent when mid matches an existing event", async () => {
    const existing = { domainId: "d-1", senderMailboxId: "mb-1", messageId: "msg-1" };
    mockEventFindFirst.mockResolvedValue(existing);

    await app.inject({ method: "GET", url: "/open?mid=msg-1" });

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type:            "OPENED",
          messageId:       "msg-1",
          domainId:        "d-1",
          senderMailboxId: "mb-1",
        }),
      })
    );
  });

  it("does not create an event when mid matches nothing", async () => {
    mockEventFindFirst.mockResolvedValue(null);
    await app.inject({ method: "GET", url: "/open?mid=unknown" });
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("still returns the pixel when mid is absent", async () => {
    const res = await app.inject({ method: "GET", url: "/open" });
    expect(res.statusCode).toBe(200);
    expect(mockEventFindFirst).not.toHaveBeenCalled();
  });
});

// ─── GET /click ────────────────────────────────────────────────────────────────
describe("GET /click", () => {
  it("redirects to the given URL", async () => {
    mockDayLogUpdate.mockResolvedValue({});
    const res = await app.inject({ method: "GET", url: "/click?url=https%3A%2F%2Fexample.com" });
    expect(res.statusCode).toBe(302);
    expect(res.headers["location"]).toBe("https://example.com/");
  });

  it("increments warmingDayLog.clicked when lid is present", async () => {
    await app.inject({ method: "GET", url: "/click?lid=dl-9&url=https%3A%2F%2Fexample.com" });
    expect(mockDayLogUpdate).toHaveBeenCalledWith({
      where: { id: "dl-9" },
      data:  { clicked: { increment: 1 } },
    });
  });

  it("returns 400 when url is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/click" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when url has a non-http protocol (open redirect guard)", async () => {
    const res = await app.inject({ method: "GET", url: "/click?url=javascript%3Aalert(1)" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a malformed URL", async () => {
    const res = await app.inject({ method: "GET", url: "/click?url=not-a-url" });
    expect(res.statusCode).toBe(400);
  });
});
