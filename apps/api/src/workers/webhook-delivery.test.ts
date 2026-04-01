import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ─── Hoisted refs — accessible inside vi.mock() factories ─────────────────────
const captured = vi.hoisted(() => ({
  processor: undefined as ((job: any) => Promise<void>) | undefined,
}));

const mockWebhook = vi.hoisted(() => vi.fn());
const mockDeliveryCreate = vi.hoisted(() => vi.fn());
const mockDeliveryUpdate = vi.hoisted(() => vi.fn());

// ─── Module mocks (hoisted before any static imports) ────────────────────────
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
    webhook: { findUnique: mockWebhook },
    webhookDelivery: { create: mockDeliveryCreate, update: mockDeliveryUpdate },
  },
}));

// Trigger module load — runs `new Worker(...)`, populates captured.processor
import "./webhook-delivery.worker";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeJob(overrides?: Partial<{ data: object; attemptsMade: number }>) {
  return {
    data: {
      webhookId: "wh-1",
      eventType: "domain.verified",
      payload: { domainId: "d-1" },
    },
    attemptsMade: 0,
    ...overrides,
  };
}

function makeWebhook(overrides?: object) {
  return {
    id: "wh-1",
    enabled: true,
    events: ["domain.verified"],
    secret: "test-secret",
    url: "https://receiver.example.com/hook",
    ...overrides,
  };
}

function mockFetch(response: { ok: boolean; status: number; body?: string }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.body ?? ""),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("webhook-delivery worker processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when webhook is not found", async () => {
    mockWebhook.mockResolvedValue(null);
    await captured.processor!(makeJob());
    expect(mockDeliveryCreate).not.toHaveBeenCalled();
  });

  it("does nothing when webhook is disabled", async () => {
    mockWebhook.mockResolvedValue(makeWebhook({ enabled: false }));
    await captured.processor!(makeJob());
    expect(mockDeliveryCreate).not.toHaveBeenCalled();
  });

  it("does nothing when eventType is not in webhook.events", async () => {
    mockWebhook.mockResolvedValue(makeWebhook({ events: ["mailbox.created"] }));
    await captured.processor!(makeJob());
    expect(mockDeliveryCreate).not.toHaveBeenCalled();
  });

  it("processes when eventType matches exactly", async () => {
    mockWebhook.mockResolvedValue(makeWebhook());
    mockDeliveryCreate.mockResolvedValue({ id: "del-1" });
    mockDeliveryUpdate.mockResolvedValue({});
    mockFetch({ ok: true, status: 200, body: "ok" });

    await captured.processor!(makeJob());
    expect(global.fetch).toHaveBeenCalledOnce();
    expect(mockDeliveryCreate).toHaveBeenCalledOnce();
  });

  it("processes when webhook.events contains wildcard *", async () => {
    mockWebhook.mockResolvedValue(makeWebhook({ events: ["*"] }));
    mockDeliveryCreate.mockResolvedValue({ id: "del-1" });
    mockDeliveryUpdate.mockResolvedValue({});
    mockFetch({ ok: true, status: 200 });

    await captured.processor!(
      makeJob({ data: { webhookId: "wh-1", eventType: "anything.happened", payload: {} } })
    );
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("sends correct HMAC-SHA256 signature in X-Mailwarm-Signature", async () => {
    const secret = "super-secret-key";
    mockWebhook.mockResolvedValue(makeWebhook({ secret }));
    mockDeliveryCreate.mockResolvedValue({ id: "del-1" });
    mockDeliveryUpdate.mockResolvedValue({});

    let capturedBody = "";
    let capturedSig = "";
    global.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
      capturedBody = opts.body;
      capturedSig = opts.headers["X-Mailwarm-Signature"];
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("ok") });
    });

    await captured.processor!(makeJob());

    const expected =
      "sha256=" + createHmac("sha256", secret).update(capturedBody).digest("hex");
    expect(capturedSig).toBe(expected);
  });

  it("sends X-Mailwarm-Event header with the event type", async () => {
    mockWebhook.mockResolvedValue(makeWebhook());
    mockDeliveryCreate.mockResolvedValue({ id: "del-1" });
    mockDeliveryUpdate.mockResolvedValue({});

    let capturedEvent = "";
    global.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
      capturedEvent = opts.headers["X-Mailwarm-Event"];
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("") });
    });

    await captured.processor!(makeJob());
    expect(capturedEvent).toBe("domain.verified");
  });

  it("records attemptCount = job.attemptsMade + 1", async () => {
    mockWebhook.mockResolvedValue(makeWebhook());
    mockDeliveryCreate.mockResolvedValue({ id: "del-1" });
    mockDeliveryUpdate.mockResolvedValue({});
    mockFetch({ ok: true, status: 200 });

    await captured.processor!(makeJob({ attemptsMade: 2 }));
    expect(mockDeliveryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attemptCount: 3 }) })
    );
  });

  it("marks delivery as succeeded when response is 2xx", async () => {
    mockWebhook.mockResolvedValue(makeWebhook());
    mockDeliveryCreate.mockResolvedValue({ id: "del-1" });
    mockDeliveryUpdate.mockResolvedValue({});
    mockFetch({ ok: true, status: 200 });

    await captured.processor!(makeJob());
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "del-1" },
        data: expect.objectContaining({ succeededAt: expect.any(Date) }),
      })
    );
  });

  it("throws on non-2xx so BullMQ retries the job", async () => {
    mockWebhook.mockResolvedValue(makeWebhook());
    mockDeliveryCreate.mockResolvedValue({ id: "del-1" });
    mockDeliveryUpdate.mockResolvedValue({});
    mockFetch({ ok: false, status: 500, body: "Internal Server Error" });

    await expect(captured.processor!(makeJob())).rejects.toThrow("HTTP 500");
  });

  it("sets nextRetryAt with exponential backoff on failure", async () => {
    mockWebhook.mockResolvedValue(makeWebhook());
    mockDeliveryCreate.mockResolvedValue({ id: "del-1" });
    mockDeliveryUpdate.mockResolvedValue({});
    mockFetch({ ok: false, status: 503 });

    const attemptsMade = 3; // delay = 2^3 * 30000 = 240000ms
    const before = Date.now();

    try {
      await captured.processor!(makeJob({ attemptsMade }));
    } catch {}

    const retryCall = mockDeliveryUpdate.mock.calls.find(
      ([args]: [any]) => args?.data?.nextRetryAt
    );
    expect(retryCall).toBeDefined();
    const nextRetryAt: Date = retryCall[0].data.nextRetryAt;
    const expectedDelay = Math.pow(2, attemptsMade) * 30_000;
    expect(nextRetryAt.getTime() - before).toBeGreaterThanOrEqual(expectedDelay - 50);
  });
});
