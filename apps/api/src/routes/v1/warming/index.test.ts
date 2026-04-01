import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp, makeCtx } from "../../../test-helpers/build-route-app";
import { warmingRoutes } from "./index";
import type { FastifyInstance } from "fastify";

// ─── Queue mock ────────────────────────────────────────────────────────────────
const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("../../../queues", () => ({ WarmingDispatchQueue: { add: mockQueueAdd } }));

// ─── Prisma mocks ──────────────────────────────────────────────────────────────
const mockScheduleFindMany   = vi.fn();
const mockScheduleFindUnique = vi.fn();
const mockScheduleFindFirst  = vi.fn();
const mockScheduleCreate     = vi.fn();
const mockScheduleUpdate     = vi.fn();
const mockDomainFindFirst    = vi.fn();

function makePrisma() {
  return {
    warmingSchedule: {
      findMany:   mockScheduleFindMany,
      findUnique: mockScheduleFindUnique,
      findFirst:  mockScheduleFindFirst,
      create:     mockScheduleCreate,
      update:     mockScheduleUpdate,
    },
    domain: { findFirst: mockDomainFindFirst },
  };
}

function makeSchedule(overrides?: object) {
  return {
    id: "sched-1", domainId: "d-1", status: "ACTIVE", currentDay: 3,
    targetDailyVolume: 100, rampCurve: "EXPONENTIAL",
    startDate: new Date("2026-03-01"), autoReply: true, autoOpen: true, autoClick: false,
    ...overrides,
  };
}

const VALID_DOMAIN_ID   = "cld1234567890abcdef12345";
const VALID_START_DATE  = "2026-04-01T00:00:00.000Z";

let app: FastifyInstance;
const CTX = makeCtx();

beforeEach(async () => {
  vi.clearAllMocks();
  mockQueueAdd.mockResolvedValue({});
  app = await buildRouteApp(warmingRoutes, { prisma: makePrisma(), ctx: CTX });
});

afterEach(() => app.close());

// ─── GET /schedules ────────────────────────────────────────────────────────────
describe("GET /schedules", () => {
  it("returns the tenant's warming schedules", async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule()]);
    const body = (await app.inject({ method: "GET", url: "/schedules" })).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("sched-1");
  });

  it("returns 401 when unauthenticated", async () => {
    const unauthed = await buildRouteApp(warmingRoutes, { prisma: makePrisma() });
    const res = await unauthed.inject({ method: "GET", url: "/schedules" });
    expect(res.statusCode).toBe(401);
    await unauthed.close();
  });
});

// ─── GET /schedules/preview ────────────────────────────────────────────────────
describe("GET /schedules/preview", () => {
  it("returns warming curve data (no auth required)", async () => {
    const res = await app.inject({ method: "GET", url: "/schedules/preview?curve=LINEAR&target=1000&days=30" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(30);
    expect(body.data[29].volume).toBe(1000);
  });

  it("defaults to EXPONENTIAL curve with 30 days", async () => {
    const res = await app.inject({ method: "GET", url: "/schedules/preview?target=500" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(30);
  });
});

// ─── POST /schedules ───────────────────────────────────────────────────────────
describe("POST /schedules", () => {
  it("returns 400 for invalid request body", async () => {
    const res = await app.inject({
      method: "POST", url: "/schedules",
      payload: { domainId: "not-a-cuid" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when domain is not found", async () => {
    mockDomainFindFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST", url: "/schedules",
      payload: { domainId: VALID_DOMAIN_ID, startDate: VALID_START_DATE, targetDailyVolume: 100 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 when a schedule already exists for the domain", async () => {
    mockDomainFindFirst.mockResolvedValue({ id: VALID_DOMAIN_ID, name: "example.com" });
    mockScheduleFindUnique.mockResolvedValue(makeSchedule()); // already exists

    const res = await app.inject({
      method: "POST", url: "/schedules",
      payload: { domainId: VALID_DOMAIN_ID, startDate: VALID_START_DATE, targetDailyVolume: 100 },
    });
    expect(res.statusCode).toBe(409);
  });

  it("creates a schedule and returns 201", async () => {
    mockDomainFindFirst.mockResolvedValue({ id: VALID_DOMAIN_ID, name: "example.com" });
    mockScheduleFindUnique.mockResolvedValue(null);
    mockScheduleCreate.mockResolvedValue(makeSchedule());

    const res = await app.inject({
      method: "POST", url: "/schedules",
      payload: { domainId: VALID_DOMAIN_ID, startDate: VALID_START_DATE, targetDailyVolume: 100 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("queues a start-warming job after creating the schedule", async () => {
    mockDomainFindFirst.mockResolvedValue({ id: VALID_DOMAIN_ID, name: "example.com" });
    mockScheduleFindUnique.mockResolvedValue(null);
    mockScheduleCreate.mockResolvedValue(makeSchedule({ id: "sched-new" }));

    await app.inject({
      method: "POST", url: "/schedules",
      payload: { domainId: VALID_DOMAIN_ID, startDate: VALID_START_DATE, targetDailyVolume: 100 },
    });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "start-warming",
      expect.objectContaining({ scheduleId: "sched-new" }),
      expect.any(Object)
    );
  });

  it("returns 403 when a STARTER tenant tries to use a custom curve", async () => {
    const starterCtx = makeCtx({ subscription: { tier: "STARTER", status: "ACTIVE" } });
    const starterApp = await buildRouteApp(warmingRoutes, { prisma: makePrisma(), ctx: starterCtx });

    const res = await starterApp.inject({
      method: "POST", url: "/schedules",
      payload: {
        domainId: VALID_DOMAIN_ID,
        startDate: VALID_START_DATE,
        targetDailyVolume: 100,
        customCurve: [{ day: 1, volume: 10 }, { day: 2, volume: 20 }],
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("feature_not_available");
    await starterApp.close();
  });
});

// ─── PATCH /schedules/:scheduleId/pause ────────────────────────────────────────
describe("PATCH /schedules/:scheduleId/pause", () => {
  it("pauses an active schedule", async () => {
    mockScheduleFindFirst.mockResolvedValue(makeSchedule());
    mockScheduleUpdate.mockResolvedValue(makeSchedule({ status: "PAUSED" }));

    const res = await app.inject({ method: "PATCH", url: "/schedules/sched-1/pause" });

    expect(res.statusCode).toBe(200);
    expect(mockScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAUSED" }) })
    );
  });

  it("returns 404 when schedule is not found", async () => {
    mockScheduleFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PATCH", url: "/schedules/s-missing/pause" });
    expect(res.statusCode).toBe(404);
  });
});

// ─── PATCH /schedules/:scheduleId/resume ───────────────────────────────────────
describe("PATCH /schedules/:scheduleId/resume", () => {
  it("resumes a paused schedule and queues resume-warming", async () => {
    mockScheduleUpdate.mockResolvedValue(makeSchedule({ id: "sched-1", status: "ACTIVE" }));

    const res = await app.inject({ method: "PATCH", url: "/schedules/sched-1/resume" });

    expect(res.statusCode).toBe(200);
    expect(mockScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ACTIVE", pausedAt: null } })
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "resume-warming",
      expect.objectContaining({ scheduleId: "sched-1" })
    );
  });
});
