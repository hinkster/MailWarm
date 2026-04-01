import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock refs ─────────────────────────────────────────────────────────
const mockMailboxFindMany      = vi.hoisted(() => vi.fn());
const mockEmailEventFindFirst  = vi.hoisted(() => vi.fn());
const mockEmailEventCreate     = vi.hoisted(() => vi.fn());
const mockWarmingDayLogFindFirst = vi.hoisted(() => vi.fn());
const mockWarmingDayLogUpdate  = vi.hoisted(() => vi.fn());
const mockTransaction          = vi.hoisted(() => vi.fn());

// ImapFlow control handles
const mockSearch       = vi.hoisted(() => vi.fn());
const mockFetch        = vi.hoisted(() => vi.fn());
const mockFlagsAdd     = vi.hoisted(() => vi.fn());
const mockConnect      = vi.hoisted(() => vi.fn());
const mockLogout       = vi.hoisted(() => vi.fn());
const mockLockRelease  = vi.hoisted(() => vi.fn());
const mockGetMailboxLock = vi.hoisted(() => vi.fn());

// ─── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(function (_queue: string) {
    return { close: vi.fn() };
  }),
  Queue: vi.fn().mockImplementation(function () {
    return { add: vi.fn() };
  }),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(class {}),
}));

vi.mock("@mailwarm/database", () => ({
  prisma: {
    mailbox:        { findMany: mockMailboxFindMany },
    emailEvent:     { findFirst: mockEmailEventFindFirst, create: mockEmailEventCreate },
    warmingDayLog:  { findFirst: mockWarmingDayLogFindFirst, update: mockWarmingDayLogUpdate },
    $transaction:   mockTransaction,
  },
}));

vi.mock("imapflow", () => ({
  ImapFlow: vi.fn().mockImplementation(class {
    connect         = mockConnect;
    logout          = mockLogout;
    getMailboxLock  = mockGetMailboxLock;
    search          = mockSearch;
    fetch           = mockFetch;
    messageFlagsAdd = mockFlagsAdd;
  }),
}));

// ─── Load module under test ────────────────────────────────────────────────────
import { recordReply, pollMailbox } from "./imap-reply.worker";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeFetchIterator(messages: object[]) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < messages.length) return { value: messages[i++], done: false };
          return { value: undefined, done: true };
        },
      };
    },
  };
}

const SENT_EVENT = {
  id: "evt-1",
  domainId: "dom-1",
  senderMailboxId: "mbx-1",
  seedMailboxId: "seed-1",
  messageId: "<orig@example.com>",
  type: "SENT",
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("recordReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (ops: any[]) => {
      for (const op of ops) await op;
    });
  });

  it("returns false when no matching SENT event exists", async () => {
    mockEmailEventFindFirst.mockResolvedValue(null);
    const result = await recordReply("dom-1", "unknown@example.com");
    expect(result).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns false when a REPLIED event already exists (deduplication)", async () => {
    mockEmailEventFindFirst
      .mockResolvedValueOnce(SENT_EVENT)   // finds SENT
      .mockResolvedValueOnce({ id: "dup" }); // finds existing REPLIED
    const result = await recordReply("dom-1", "<orig@example.com>");
    expect(result).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("creates a REPLIED event and returns true", async () => {
    mockEmailEventFindFirst
      .mockResolvedValueOnce(SENT_EVENT)
      .mockResolvedValueOnce(null); // no duplicate
    mockWarmingDayLogFindFirst.mockResolvedValue(null);
    mockEmailEventCreate.mockResolvedValue({});

    const result = await recordReply("dom-1", "<orig@example.com>");
    expect(result).toBe(true);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("increments WarmingDayLog.replied when today's log exists", async () => {
    mockEmailEventFindFirst
      .mockResolvedValueOnce(SENT_EVENT)
      .mockResolvedValueOnce(null);
    mockWarmingDayLogFindFirst.mockResolvedValue({ id: "log-1" });
    mockEmailEventCreate.mockResolvedValue({});
    mockWarmingDayLogUpdate.mockResolvedValue({});

    await recordReply("dom-1", "<orig@example.com>");

    const [ops] = mockTransaction.mock.calls[0];
    expect(ops).toHaveLength(2); // create + update
  });

  it("skips WarmingDayLog update when no log exists for today", async () => {
    mockEmailEventFindFirst
      .mockResolvedValueOnce(SENT_EVENT)
      .mockResolvedValueOnce(null);
    mockWarmingDayLogFindFirst.mockResolvedValue(null);
    mockEmailEventCreate.mockResolvedValue({});

    await recordReply("dom-1", "<orig@example.com>");

    const [ops] = mockTransaction.mock.calls[0];
    expect(ops).toHaveLength(1); // create only
  });
});

describe("pollMailbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockLogout.mockResolvedValue(undefined);
    mockFlagsAdd.mockResolvedValue(undefined);
    mockGetMailboxLock.mockResolvedValue({ release: mockLockRelease });
    mockTransaction.mockImplementation(async (ops: any[]) => {
      for (const op of ops) await op;
    });
  });

  it("returns 0 when INBOX has no unseen messages", async () => {
    mockSearch.mockResolvedValue([]);
    const count = await pollMailbox("warm1@example.com", "dom-1", "master", "pass");
    expect(count).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips messages without In-Reply-To and marks them seen", async () => {
    mockSearch.mockResolvedValue([1]);
    mockFetch.mockReturnValue(makeFetchIterator([
      { uid: 1, envelope: { inReplyTo: undefined } },
    ]));
    const count = await pollMailbox("warm1@example.com", "dom-1", "master", "pass");
    expect(count).toBe(0);
    expect(mockFlagsAdd).toHaveBeenCalledWith({ uid: 1 }, ["\\Seen"], { uid: true });
  });

  it("records a reply and marks message seen when In-Reply-To matches", async () => {
    mockSearch.mockResolvedValue([2]);
    mockFetch.mockReturnValue(makeFetchIterator([
      { uid: 2, envelope: { inReplyTo: "<orig@example.com>" } },
    ]));
    mockEmailEventFindFirst
      .mockResolvedValueOnce(SENT_EVENT)  // SENT lookup
      .mockResolvedValueOnce(null);       // no duplicate REPLIED
    mockWarmingDayLogFindFirst.mockResolvedValue(null);
    mockEmailEventCreate.mockResolvedValue({});

    const count = await pollMailbox("warm1@example.com", "dom-1", "master", "pass");
    expect(count).toBe(1);
    expect(mockFlagsAdd).toHaveBeenCalledWith({ uid: 2 }, ["\\Seen"], { uid: true });
  });

  it("releases the mailbox lock even when fetch throws", async () => {
    mockSearch.mockResolvedValue([3]);
    mockFetch.mockReturnValue(makeFetchIterator([
      { uid: 3, envelope: { inReplyTo: "<x@y.com>" } },
    ]));
    mockEmailEventFindFirst.mockRejectedValue(new Error("db error"));

    await expect(
      pollMailbox("warm1@example.com", "dom-1", "master", "pass")
    ).rejects.toThrow("db error");

    expect(mockLockRelease).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
  });
});
