import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────
const captured = vi.hoisted(() => ({
  processor: undefined as ((job: any) => Promise<any>) | undefined,
}));

const mockRunReputationCheck   = vi.hoisted(() => vi.fn());
const mockRepCheckCreate       = vi.hoisted(() => vi.fn());
const mockDomainUpdate         = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(function (this: any, _queue: string, fn: any) {
    captured.processor = fn;
    this.on = vi.fn();
    return this;
  }),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(function (this: any) {}),
}));

// reputation-check.worker uses `new PrismaClient()` directly (not @mailwarm/database)
vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(function (this: any) {
    this.reputationCheck = { create: mockRepCheckCreate };
    this.domain          = { update: mockDomainUpdate };
  }),
}));

vi.mock("../services/reputation/checker", () => ({
  runReputationCheck: mockRunReputationCheck,
}));

// Trigger module load
import "./reputation-check.worker";

// ─── Fixtures ─────────────────────────────────────────────────name──────────
function makeJob(overrides?: object) {
  return {
    data: { domainId: "d-1", domainName: "example.com" },
    log: vi.fn(),
    ...overrides,
  };
}

function makeCheckResult(overrides?: object) {
  return {
    score: 72,
    signals: { spf: { present: true, valid: true, value: "v=spf1 ~all" } },
    listedOn: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("reputation-check worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepCheckCreate.mockResolvedValue({});
    mockDomainUpdate.mockResolvedValue({});
  });

  it("calls runReputationCheck with domainName, domainId, and the prisma instance", async () => {
    mockRunReputationCheck.mockResolvedValue(makeCheckResult());
    await captured.processor!(makeJob());
    expect(mockRunReputationCheck).toHaveBeenCalledWith(
      "example.com",
      "d-1",
      expect.objectContaining({ reputationCheck: expect.anything() })
    );
  });

  it("persists a ReputationCheck record with the score, signals, and listedOn", async () => {
    const result = makeCheckResult({ score: 85, listedOn: ["Spamhaus ZEN"] });
    mockRunReputationCheck.mockResolvedValue(result);

    await captured.processor!(makeJob());

    expect(mockRepCheckCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          domainId: "d-1",
          score:    85,
          listedOn: ["Spamhaus ZEN"],
          signals:  result.signals,
        }),
      })
    );
  });

  it("updates domain.reputationScore with the computed score", async () => {
    mockRunReputationCheck.mockResolvedValue(makeCheckResult({ score: 63 }));

    await captured.processor!(makeJob());

    expect(mockDomainUpdate).toHaveBeenCalledWith({
      where: { id: "d-1" },
      data:  { reputationScore: 63 },
    });
  });

  it("returns { score, listedOn } from the processor", async () => {
    mockRunReputationCheck.mockResolvedValue(makeCheckResult({ score: 90, listedOn: [] }));

    const result = await captured.processor!(makeJob());

    expect(result).toEqual({ score: 90, listedOn: [] });
  });

  it("logs the domain name and result score", async () => {
    mockRunReputationCheck.mockResolvedValue(makeCheckResult({ score: 50 }));
    const job = makeJob();

    await captured.processor!(job);

    expect(job.log).toHaveBeenCalledTimes(2);
  });
});
