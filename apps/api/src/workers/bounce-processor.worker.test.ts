import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────
const captured = vi.hoisted(() => ({
  processor: undefined as ((job: any) => Promise<void>) | undefined,
}));

const mockMailboxFindFirst = vi.hoisted(() => vi.fn());
const mockEventCreate      = vi.hoisted(() => vi.fn());
const mockMailboxUpdate    = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(function (_queue: string, fn: any) {
    captured.processor = fn;
    return { close: vi.fn() };
  }),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(class {}),
}));

vi.mock("@mailwarm/database", () => ({
  prisma: {
    mailbox:    { findFirst: mockMailboxFindFirst, update: mockMailboxUpdate },
    emailEvent: { create: mockEventCreate },
  },
}));

// Trigger module load — populates captured.processor
import "./bounce-processor.worker";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeJob(data?: Partial<{ bounceFor: string; rawMessage: string; timestamp: string }>) {
  return {
    data: {
      bounceFor:  "hello@example.com",
      rawMessage: "550 User does not exist",
      timestamp:  "2026-03-28T10:00:00Z",
      ...data,
    },
  };
}

function makeMailbox(overrides?: object) {
  return {
    id:       "mb-1",
    domainId: "d-1",
    address:  "hello@example.com",
    domain:   { name: "example.com" },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("bounce-processor worker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when mailbox is not found", async () => {
    mockMailboxFindFirst.mockResolvedValue(null);
    await captured.processor!(makeJob());
    expect(mockEventCreate).not.toHaveBeenCalled();
    expect(mockMailboxUpdate).not.toHaveBeenCalled();
  });

  it("creates a BOUNCED / HARD event for a 5xx message", async () => {
    mockMailboxFindFirst.mockResolvedValue(makeMailbox());
    mockEventCreate.mockResolvedValue({});
    mockMailboxUpdate.mockResolvedValue({});

    await captured.processor!(makeJob({ rawMessage: "550 Mailbox unavailable" }));

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type:            "BOUNCED",
          bounceType:      "HARD",
          domainId:        "d-1",
          senderMailboxId: "mb-1",
        }),
      })
    );
  });

  it("creates a BOUNCED / SOFT event for a 4xx message", async () => {
    mockMailboxFindFirst.mockResolvedValue(makeMailbox());
    mockEventCreate.mockResolvedValue({});

    await captured.processor!(makeJob({ rawMessage: "421 Service temporarily unavailable" }));

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bounceType: "SOFT" }),
      })
    );
  });

  it("suspends the mailbox on a hard bounce", async () => {
    mockMailboxFindFirst.mockResolvedValue(makeMailbox());
    mockEventCreate.mockResolvedValue({});
    mockMailboxUpdate.mockResolvedValue({});

    await captured.processor!(makeJob({ rawMessage: "550 rejected" }));

    expect(mockMailboxUpdate).toHaveBeenCalledWith({
      where: { id: "mb-1" },
      data:  { status: "SUSPENDED" },
    });
  });

  it("does NOT suspend the mailbox on a soft bounce", async () => {
    mockMailboxFindFirst.mockResolvedValue(makeMailbox());
    mockEventCreate.mockResolvedValue({});

    await captured.processor!(makeJob({ rawMessage: "451 Try again later" }));

    expect(mockMailboxUpdate).not.toHaveBeenCalled();
  });

  it("stores the timestamp as a Date on the EmailEvent", async () => {
    mockMailboxFindFirst.mockResolvedValue(makeMailbox());
    mockEventCreate.mockResolvedValue({});
    mockMailboxUpdate.mockResolvedValue({});

    const timestamp = "2026-01-15T08:30:00Z";
    await captured.processor!(makeJob({ rawMessage: "550 rejected", timestamp }));

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ occurredAt: new Date(timestamp) }),
      })
    );
  });

  it("truncates rawMessage to 2000 chars in metadata", async () => {
    mockMailboxFindFirst.mockResolvedValue(makeMailbox());
    mockEventCreate.mockResolvedValue({});
    mockMailboxUpdate.mockResolvedValue({});

    const longMessage = "550 " + "x".repeat(3000);
    await captured.processor!(makeJob({ rawMessage: longMessage }));

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { raw: longMessage.slice(0, 2000) },
        }),
      })
    );
  });

  it("looks up the mailbox by the bounceFor address", async () => {
    mockMailboxFindFirst.mockResolvedValue(null);
    await captured.processor!(makeJob({ bounceFor: "custom@domain.io" }));
    expect(mockMailboxFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { address: "custom@domain.io" } })
    );
  });
});
