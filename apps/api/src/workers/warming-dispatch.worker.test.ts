import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────
const captured = vi.hoisted(() => ({
  processor: undefined as ((job: any) => Promise<void>) | undefined,
}));

const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({}));

const mockSendWarmingEmail  = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCalcDayVolume     = vi.hoisted(() => vi.fn().mockReturnValue(10));

const mockScheduleFindMany  = vi.hoisted(() => vi.fn());
const mockScheduleUpdate    = vi.hoisted(() => vi.fn());
const mockDayLogFindUnique  = vi.hoisted(() => vi.fn());
const mockDayLogFindFirst   = vi.hoisted(() => vi.fn());
const mockDayLogCreate      = vi.hoisted(() => vi.fn());
const mockSeedFindMany      = vi.hoisted(() => vi.fn());
const mockDomainUpdate      = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(function (_queue: string, fn: any) {
    captured.processor = fn;
    return { close: vi.fn() };
  }),
  Queue: vi.fn().mockImplementation(function () {
    return { add: mockQueueAdd, on: vi.fn() };
  }),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(class {}),
}));

vi.mock("@mailwarm/database", () => ({
  prisma: {
    warmingSchedule: { findMany: mockScheduleFindMany, update: mockScheduleUpdate },
    warmingDayLog:   { findUnique: mockDayLogFindUnique, findFirst: mockDayLogFindFirst, create: mockDayLogCreate },
    seedMailbox:     { findMany: mockSeedFindMany },
    domain:          { update: mockDomainUpdate },
  },
}));

vi.mock("../queues", () => ({
  WarmingDispatchQueue: { add: mockQueueAdd, on: vi.fn() },
  MetricsRollupQueue:   { add: vi.fn(), on: vi.fn() },
}));

vi.mock("../services/warming/sender", () => ({
  sendWarmingEmail: mockSendWarmingEmail,
}));

vi.mock("@mailwarm/shared/src/constants/warming-curves", () => ({
  calculateDayVolume: mockCalcDayVolume,
}));

// Trigger module load
import "./warming-dispatch.worker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
function makeSchedule(overrides?: object) {
  return {
    id:               "sched-1",
    status:           "ACTIVE",
    currentDay:       3,
    targetDailyVolume: 50,
    rampCurve:        "LINEAR",
    customCurve:      null,
    autoReply:        false,
    autoOpen:         false,
    autoClick:        false,
    domainId:         "d-1",
    domain: {
      mailboxes: [{ id: "mb-1", address: "a@example.com" }],
      tenant: { subscription: { tier: "GROWTH" } },
      tenantId: "t-1",
    },
    ...overrides,
  };
}

function makeDayLog(overrides?: object) {
  return { id: "dl-1", scheduleId: "sched-1", dayNumber: 3, actualSent: 0, ...overrides };
}

function makeSeed(id = "seed-1") {
  return { id, address: `inbox-${id}@seed.io`, status: "ACTIVE" };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("warming-dispatch worker — start-warming", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets schedule to ACTIVE with currentDay=1", async () => {
    mockScheduleUpdate.mockResolvedValue({ id: "sched-1", domainId: "d-1" });
    mockDomainUpdate.mockResolvedValue({});

    await captured.processor!({ name: "start-warming", data: { scheduleId: "sched-1" } });

    expect(mockScheduleUpdate).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data:  { status: "ACTIVE", currentDay: 1 },
    });
  });

  it("sets domain status to WARMING", async () => {
    mockScheduleUpdate.mockResolvedValue({ id: "sched-1", domainId: "d-1" });
    mockDomainUpdate.mockResolvedValue({});

    await captured.processor!({ name: "start-warming", data: { scheduleId: "sched-1" } });

    expect(mockDomainUpdate).toHaveBeenCalledWith({
      where: { id: "d-1" },
      data:  { status: "WARMING" },
    });
  });
});

describe("warming-dispatch worker — resume-warming", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets schedule to ACTIVE and clears pausedAt", async () => {
    mockScheduleUpdate.mockResolvedValue({});

    await captured.processor!({ name: "resume-warming", data: { scheduleId: "sched-1" } });

    expect(mockScheduleUpdate).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data:  { status: "ACTIVE", pausedAt: null },
    });
  });
});

describe("warming-dispatch worker — daily-dispatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips a schedule that has no active mailboxes", async () => {
    mockScheduleFindMany.mockResolvedValue([
      makeSchedule({ domain: { mailboxes: [], tenant: { subscription: { tier: "GROWTH" } }, tenantId: "t-1" } }),
    ]);

    await captured.processor!({ name: "daily-dispatch", data: {} });

    expect(mockDayLogFindUnique).not.toHaveBeenCalled();
    expect(mockSendWarmingEmail).not.toHaveBeenCalled();
  });

  it("skips a schedule that has already met its daily target", async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule()]);
    mockCalcDayVolume.mockReturnValue(10);
    mockDayLogFindUnique.mockResolvedValue(makeDayLog({ actualSent: 10 })); // remaining = 0

    await captured.processor!({ name: "daily-dispatch", data: {} });

    expect(mockSendWarmingEmail).not.toHaveBeenCalled();
  });

  it("creates a new dayLog when one does not exist yet", async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule()]);
    mockCalcDayVolume.mockReturnValue(5);
    mockDayLogFindUnique.mockResolvedValue(null);
    mockDayLogCreate.mockResolvedValue(makeDayLog());
    mockSeedFindMany.mockResolvedValue([makeSeed()]);
    mockDayLogFindFirst.mockResolvedValue(null);

    await captured.processor!({ name: "daily-dispatch", data: {} });

    expect(mockDayLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduleId:   "sched-1",
          dayNumber:    3,
          targetVolume: 5,
        }),
      })
    );
  });

  it("sends warming emails to each seed returned from the pool", async () => {
    mockScheduleFindMany.mockResolvedValue([makeSchedule()]);
    mockCalcDayVolume.mockReturnValue(3);
    mockDayLogFindUnique.mockResolvedValue(makeDayLog({ actualSent: 0 }));
    mockSeedFindMany.mockResolvedValue([makeSeed("s-1"), makeSeed("s-2"), makeSeed("s-3")]);
    mockDayLogFindFirst.mockResolvedValue(null);

    await captured.processor!({ name: "daily-dispatch", data: {} });

    expect(mockSendWarmingEmail).toHaveBeenCalledTimes(3);
  });

  it("uses customCurve volume when present instead of calculateDayVolume", async () => {
    const schedule = makeSchedule({
      currentDay:  2,
      customCurve: [{ day: 1, volume: 5 }, { day: 2, volume: 20 }],
    });
    mockScheduleFindMany.mockResolvedValue([schedule]);
    mockDayLogFindUnique.mockResolvedValue(makeDayLog({ actualSent: 0 }));
    mockDayLogCreate.mockResolvedValue(makeDayLog());
    mockSeedFindMany.mockResolvedValue([]);
    mockDayLogFindFirst.mockResolvedValue(null);

    await captured.processor!({ name: "daily-dispatch", data: {} });

    // calculateDayVolume should NOT have been called
    expect(mockCalcDayVolume).not.toHaveBeenCalled();
  });

  it("advances the day counter when lastLog is from a previous day", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockScheduleFindMany.mockResolvedValue([makeSchedule()]);
    mockCalcDayVolume.mockReturnValue(5);
    mockDayLogFindUnique.mockResolvedValue(makeDayLog({ actualSent: 0 }));
    mockSeedFindMany.mockResolvedValue([]);
    mockDayLogFindFirst.mockResolvedValue({ id: "dl-prev", date: yesterday, dayNumber: 2 });

    await captured.processor!({ name: "daily-dispatch", data: {} });

    expect(mockScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sched-1" },
        data:  { currentDay: { increment: 1 } },
      })
    );
  });

  it("does NOT advance the day counter when lastLog date is today", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    mockScheduleFindMany.mockResolvedValue([makeSchedule()]);
    mockCalcDayVolume.mockReturnValue(5);
    mockDayLogFindUnique.mockResolvedValue(makeDayLog({ actualSent: 0 }));
    mockSeedFindMany.mockResolvedValue([]);
    mockDayLogFindFirst.mockResolvedValue({ id: "dl-today", date: today, dayNumber: 3 });

    await captured.processor!({ name: "daily-dispatch", data: {} });

    expect(mockScheduleUpdate).not.toHaveBeenCalled();
  });
});
