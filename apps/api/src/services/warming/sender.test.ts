import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted refs — accessible inside vi.mock() factories ─────────────────────
const mockSendMail = vi.hoisted(() => vi.fn());
const mockEventCreate = vi.hoisted(() => vi.fn());
const mockDayLogUpdate = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({ sendMail: mockSendMail }),
  },
}));

vi.mock("@mailwarm/database", () => ({
  prisma: {
    emailEvent: { create: mockEventCreate },
    warmingDayLog: { update: mockDayLogUpdate },
  },
}));

import { sendWarmingEmail } from "./sender";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const from = {
  id: "mb-1",
  domainId: "d-1",
  address: "hello@example.com",
  displayName: "Hello Team",
} as any;

const to = {
  id: "seed-1",
  address: "inbox@seedpool.internal",
} as any;

const baseParams = {
  from,
  to,
  scheduleId: "sched-1",
  dayLogId: "dl-1",
  autoReply: false,
  autoOpen: false,
  autoClick: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("sendWarmingEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_URL = "https://api.mailwarm.io";
    mockSendMail.mockResolvedValue({});
    mockEventCreate.mockResolvedValue({});
    mockDayLogUpdate.mockResolvedValue({});
  });

  it("calls sendMail with correct from address", async () => {
    await sendWarmingEmail(baseParams);
    expect(mockSendMail.mock.calls[0][0].from).toContain("hello@example.com");
  });

  it("calls sendMail with correct to address", async () => {
    await sendWarmingEmail(baseParams);
    expect(mockSendMail.mock.calls[0][0].to).toBe("inbox@seedpool.internal");
  });

  it("uses displayName in the from field", async () => {
    await sendWarmingEmail(baseParams);
    expect(mockSendMail.mock.calls[0][0].from).toContain("Hello Team");
  });

  it("falls back to email username when displayName is null", async () => {
    await sendWarmingEmail({ ...baseParams, from: { ...from, displayName: null } });
    // username portion of hello@example.com
    expect(mockSendMail.mock.calls[0][0].from).toContain("hello");
  });

  it("embeds a tracking pixel pointing to /v1/track/open", async () => {
    await sendWarmingEmail(baseParams);
    const html: string = mockSendMail.mock.calls[0][0].html;
    expect(html).toContain("https://api.mailwarm.io/v1/track/open");
  });

  it("includes dayLogId (lid) in the tracking pixel URL", async () => {
    await sendWarmingEmail({ ...baseParams, dayLogId: "dl-99" });
    const html: string = mockSendMail.mock.calls[0][0].html;
    expect(html).toContain("lid=dl-99");
  });

  it("includes a pre-generated messageId (mid) in the tracking pixel URL", async () => {
    await sendWarmingEmail(baseParams);
    const html: string = mockSendMail.mock.calls[0][0].html;
    expect(html).toContain("mid=");
  });

  it("sends both text and html versions", async () => {
    await sendWarmingEmail(baseParams);
    const mail = mockSendMail.mock.calls[0][0];
    expect(typeof mail.text).toBe("string");
    expect(typeof mail.html).toBe("string");
  });

  it("includes X-Mailwarm-Schedule header", async () => {
    await sendWarmingEmail({ ...baseParams, scheduleId: "sched-42" });
    expect(mockSendMail.mock.calls[0][0].headers["X-Mailwarm-Schedule"]).toBe("sched-42");
  });

  it("includes X-Mailwarm-DayLog header", async () => {
    await sendWarmingEmail({ ...baseParams, dayLogId: "dl-77" });
    expect(mockSendMail.mock.calls[0][0].headers["X-Mailwarm-DayLog"]).toBe("dl-77");
  });

  it("sets X-Mailwarm-AutoReply to '1' when autoReply is true", async () => {
    await sendWarmingEmail({ ...baseParams, autoReply: true });
    expect(mockSendMail.mock.calls[0][0].headers["X-Mailwarm-AutoReply"]).toBe("1");
  });

  it("sets X-Mailwarm-AutoReply to '0' when autoReply is false", async () => {
    await sendWarmingEmail({ ...baseParams, autoReply: false });
    expect(mockSendMail.mock.calls[0][0].headers["X-Mailwarm-AutoReply"]).toBe("0");
  });

  it("creates an EmailEvent with type SENT after sending", async () => {
    await sendWarmingEmail(baseParams);
    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "SENT",
          domainId: "d-1",
          senderMailboxId: "mb-1",
          seedMailboxId: "seed-1",
        }),
      })
    );
  });

  it("increments warmingDayLog.actualSent by 1", async () => {
    await sendWarmingEmail(baseParams);
    expect(mockDayLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dl-1" },
        data: { actualSent: { increment: 1 } },
      })
    );
  });

  it("does not throw when sendMail fails (swallowed error)", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP connection refused"));
    await expect(sendWarmingEmail(baseParams)).resolves.toBeUndefined();
  });

  it("does not write to the database when sendMail fails", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP timeout"));
    await sendWarmingEmail(baseParams);
    expect(mockEventCreate).not.toHaveBeenCalled();
    expect(mockDayLogUpdate).not.toHaveBeenCalled();
  });
});
