import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────
const captured = vi.hoisted(() => ({
  processor: undefined as ((job: any) => Promise<void>) | undefined,
}));

const mockScheduleFindMany = vi.hoisted(() => vi.fn());
const mockEventGroupBy     = vi.hoisted(() => vi.fn());
const mockDomainUpdate     = vi.hoisted(() => vi.fn());
const mockDomainFindMany   = vi.hoisted(() => vi.fn());
const mockQueueAdd         = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockQueueOn          = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(function (_queue: string, fn: any) {
    captured.processor = fn;
    return { close: vi.fn(), on: vi.fn() };
  }),
  Queue: vi.fn().mockImplementation(function () {
    return { add: mockQueueAdd, on: mockQueueOn };
  }),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(class {}),
}));

vi.mock("@mailwarm/database", () => ({
  prisma: {
    warmingSchedule: { findMany: mockScheduleFindMany },
    emailEvent:      { groupBy:  mockEventGroupBy     },
    domain:          { update:   mockDomainUpdate, findMany: mockDomainFindMany },
  },
}));

vi.mock("../queues", () => ({
  MetricsRollupQueue:  { add: mockQueueAdd, on: mockQueueOn },
  ReputationCheckQueue: { add: vi.fn() },
}));

// Trigger module load
import "./metrics-rollup.worker";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeGroupBy(entries: Array<{ type: string; count: number }>) {
  return entries.map((e) => ({ type: e.type, _count: { type: e.count } }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("metrics-rollup worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDomainUpdate.mockResolvedValue({});
    mockDomainFindMany.mockResolvedValue([]);
  });

  it("does nothing when there are no active warming schedules", async () => {
    mockScheduleFindMany.mockResolvedValue([]);
    await captured.processor!({ data: {} });
    expect(mockEventGroupBy).not.toHaveBeenCalled();
    expect(mockDomainUpdate).not.toHaveBeenCalled();
  });

  it("skips a domain that has 0 sent emails", async () => {
    mockScheduleFindMany.mockResolvedValue([{ domainId: "d-1" }]);
    mockEventGroupBy.mockResolvedValue([]); // no events → sent = 0

    await captured.processor!({ data: {} });

    expect(mockDomainUpdate).not.toHaveBeenCalled();
  });

  it("updates reputationScore for a domain with email data", async () => {
    mockScheduleFindMany.mockResolvedValue([{ domainId: "d-1" }]);
    mockEventGroupBy.mockResolvedValue(
      makeGroupBy([{ type: "SENT", count: 100 }, { type: "DELIVERED", count: 100 }])
    );

    await captured.processor!({ data: {} });

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d-1" } })
    );
  });

  // ── Score formula: 50 + delivery*20 + open*20 - bounce*40 - complaint*60 ──
  it("returns 50 when all rates are 0 (sent=0 edge case bypassed with 1 sent, 0 else)", async () => {
    // sent=10, delivered=0, opened=0, bounced=0, complained=0
    // score = round(50 + 0 + 0 - 0 - 0) = 50
    mockScheduleFindMany.mockResolvedValue([{ domainId: "d-1" }]);
    mockEventGroupBy.mockResolvedValue(makeGroupBy([{ type: "SENT", count: 10 }]));

    await captured.processor!({ data: {} });

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reputationScore: 50 } })
    );
  });

  it("returns 90 for perfect delivery and open rates (no bounces/complaints)", async () => {
    // deliveryRate=1 → +20, openRate=1 → +20 ⇒ 50+20+20 = 90
    mockScheduleFindMany.mockResolvedValue([{ domainId: "d-1" }]);
    mockEventGroupBy.mockResolvedValue(makeGroupBy([
      { type: "SENT",      count: 100 },
      { type: "DELIVERED", count: 100 },
      { type: "OPENED",    count: 100 },
    ]));

    await captured.processor!({ data: {} });

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reputationScore: 90 } })
    );
  });

  it("penalises bounce rate correctly", async () => {
    // sent=100, bounced=50 → bounceRate=0.5 → -40*0.5=-20 ⇒ 50-20=30
    mockScheduleFindMany.mockResolvedValue([{ domainId: "d-1" }]);
    mockEventGroupBy.mockResolvedValue(makeGroupBy([
      { type: "SENT",    count: 100 },
      { type: "BOUNCED", count: 50  },
    ]));

    await captured.processor!({ data: {} });

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reputationScore: 30 } })
    );
  });

  it("penalises complaint rate correctly", async () => {
    // sent=100, complained=50 → complaintRate=0.5 → -60*0.5=-30 ⇒ 50-30=20
    mockScheduleFindMany.mockResolvedValue([{ domainId: "d-1" }]);
    mockEventGroupBy.mockResolvedValue(makeGroupBy([
      { type: "SENT",       count: 100 },
      { type: "COMPLAINED", count: 50  },
    ]));

    await captured.processor!({ data: {} });

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reputationScore: 20 } })
    );
  });

  it("clamps score to 0 when bounces and complaints are extreme", async () => {
    // sent=100, bounced=100 → -40; complained=100 → -60 ⇒ 50-40-60 = -50 → clamped to 0
    mockScheduleFindMany.mockResolvedValue([{ domainId: "d-1" }]);
    mockEventGroupBy.mockResolvedValue(makeGroupBy([
      { type: "SENT",       count: 100 },
      { type: "BOUNCED",    count: 100 },
      { type: "COMPLAINED", count: 100 },
    ]));

    await captured.processor!({ data: {} });

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reputationScore: 0 } })
    );
  });

  it("processes multiple active domains independently", async () => {
    mockScheduleFindMany.mockResolvedValue([{ domainId: "d-1" }, { domainId: "d-2" }]);
    mockEventGroupBy
      .mockResolvedValueOnce(makeGroupBy([{ type: "SENT", count: 50 }]))
      .mockResolvedValueOnce(makeGroupBy([{ type: "SENT", count: 80 }]));

    await captured.processor!({ data: {} });

    expect(mockDomainUpdate).toHaveBeenCalledTimes(2);
    expect(mockDomainUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d-1" } }));
    expect(mockDomainUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d-2" } }));
  });
});
