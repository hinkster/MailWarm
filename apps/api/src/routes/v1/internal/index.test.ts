import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp } from "../../../test-helpers/build-route-app";
import { internalRoutes } from "./index";
import type { FastifyInstance } from "fastify";

// ─── Queue mock ────────────────────────────────────────────────────────────────
const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("../../../queues", () => ({ BounceProcessorQueue: { add: mockQueueAdd } }));

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockDayLogFindUnique    = vi.fn();
const mockDayLogUpdate        = vi.fn();
const mockScheduleFindUnique  = vi.fn();
const mockEmailEventCreate    = vi.fn();

function makePrisma() {
  return {
    warmingDayLog:    { findUnique: mockDayLogFindUnique, update: mockDayLogUpdate },
    warmingSchedule:  { findUnique: mockScheduleFindUnique },
    emailEvent:       { create: mockEmailEventCreate },
  };
}

const MTA_TOKEN = "test-mta-token";
const AUTH = { authorization: `Bearer ${MTA_TOKEN}` };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.MTA_INTERNAL_TOKEN = MTA_TOKEN;
  app = await buildRouteApp(internalRoutes, { prisma: makePrisma() });

  // Default happy-path mocks
  mockDayLogFindUnique.mockResolvedValue({ id: "dl-1" });
  mockScheduleFindUnique.mockResolvedValue({ id: "sched-1", domain: { id: "d-1" } });
  mockDayLogUpdate.mockResolvedValue({});
  mockEmailEventCreate.mockResolvedValue({});
});

afterEach(() => app.close());

// ─── POST /event ───────────────────────────────────────────────────────────────
describe("POST /event", () => {
  it("returns 403 when MTA token is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/event", payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when MTA token is wrong", async () => {
    const res = await app.inject({
      method: "POST", url: "/event",
      headers: { authorization: "Bearer wrong-token" },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for an invalid request body", async () => {
    const res = await app.inject({
      method: "POST", url: "/event",
      headers: AUTH,
      payload: { type: "DELIVERED" }, // missing required fields
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when dayLog is not found", async () => {
    mockDayLogFindUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST", url: "/event",
      headers: AUTH,
      payload: { type: "DELIVERED", scheduleId: "s-1", dayLogId: "dl-missing" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when schedule is not found", async () => {
    mockScheduleFindUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST", url: "/event",
      headers: AUTH,
      payload: { type: "DELIVERED", scheduleId: "s-missing", dayLogId: "dl-1" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("increments delivered count on DELIVERED event", async () => {
    const res = await app.inject({
      method: "POST", url: "/event",
      headers: AUTH,
      payload: { type: "DELIVERED", scheduleId: "sched-1", dayLogId: "dl-1", messageId: "msg-1" },
    });
    expect(res.statusCode).toBe(204);
    expect(mockDayLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { delivered: { increment: 1 } } })
    );
  });

  it("creates a DELIVERED email event", async () => {
    await app.inject({
      method: "POST", url: "/event",
      headers: AUTH,
      payload: { type: "DELIVERED", scheduleId: "sched-1", dayLogId: "dl-1", messageId: "msg-1" },
    });
    expect(mockEmailEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "DELIVERED", domainId: "d-1" }) })
    );
  });

  it("increments bounced count on BOUNCED event", async () => {
    const res = await app.inject({
      method: "POST", url: "/event",
      headers: AUTH,
      payload: { type: "BOUNCED", scheduleId: "sched-1", dayLogId: "dl-1", error: "550 No such user" },
    });
    expect(res.statusCode).toBe(204);
    expect(mockDayLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bounced: { increment: 1 } } })
    );
  });

  it("includes error metadata in BOUNCED email event", async () => {
    await app.inject({
      method: "POST", url: "/event",
      headers: AUTH,
      payload: { type: "BOUNCED", scheduleId: "sched-1", dayLogId: "dl-1", error: "550 No such user" },
    });
    expect(mockEmailEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "BOUNCED", metadata: { error: "550 No such user" } }),
      })
    );
  });
});

// ─── POST /bounce ──────────────────────────────────────────────────────────────
describe("POST /bounce", () => {
  it("returns 403 when MTA token is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/bounce", payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for an invalid bounce payload", async () => {
    const res = await app.inject({
      method: "POST", url: "/bounce",
      headers: AUTH,
      payload: { bounceFor: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("queues a process-bounce job and returns 202", async () => {
    const res = await app.inject({
      method: "POST", url: "/bounce",
      headers: AUTH,
      payload: {
        bounceFor: "user@example.com",
        rawMessage: "550 no such user",
        timestamp: "2026-03-01T00:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(202);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-bounce",
      expect.objectContaining({ bounceFor: "user@example.com" })
    );
  });
});
