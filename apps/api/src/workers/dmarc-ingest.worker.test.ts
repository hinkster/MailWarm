import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────
const captured = vi.hoisted(() => ({
  processor: undefined as ((job: any) => Promise<void>) | undefined,
}));

const mockDomainFindFirst   = vi.hoisted(() => vi.fn());
const mockDmarcReportUpsert = vi.hoisted(() => vi.fn());

const mockExtractXml  = vi.hoisted(() => vi.fn());
const mockParseDmarc  = vi.hoisted(() => vi.fn());

// ─── Module mocks ──────────────────────────────────────────────────────────────
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
    domain:      { findFirst: mockDomainFindFirst },
    dmarcReport: { upsert: mockDmarcReportUpsert },
  },
}));

vi.mock("../lib/dmarc", () => ({
  extractXmlFromEmail: mockExtractXml,
  parseDmarcXml:       mockParseDmarc,
}));

// Trigger module load
import "./dmarc-ingest.worker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const MOCK_FEEDBACK = {
  report_metadata: { org_name: "Google", report_id: "rpt-001", date_range: { begin: "1700000000", end: "1700086400" } },
  policy_published: { domain: "example.com" },
  record: {},
};

const MOCK_ANALYSIS = {
  passCount: 10,
  failCount: 0,
  dispositions: { none: 10 },
  sourceRecords: [
    {
      sourceIp: "1.2.3.4",
      count: 10,
      disposition: "none",
      dkimAlignment: "pass",
      spfAlignment: "pass",
      dkimAuthResult: "pass",
      spfAuthResult: "pass",
      headerFrom: "example.com",
      envelopeFrom: "example.com",
    },
  ],
};

const MOCK_PARSE_RESULT = { feedback: MOCK_FEEDBACK, analysis: MOCK_ANALYSIS };

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("dmarc-ingest worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDmarcReportUpsert.mockResolvedValue({});
    mockParseDmarc.mockResolvedValue(MOCK_PARSE_RESULT);
  });

  // ── Early exits ───────────────────────────────────────────────────────────
  it("does nothing when neither xmlReport nor rawEmail is provided", async () => {
    await captured.processor!({ data: { tenantId: "t-1", domain: "example.com" } });
    expect(mockDmarcReportUpsert).not.toHaveBeenCalled();
  });

  it("does nothing when rawEmail extraction returns null", async () => {
    mockExtractXml.mockReturnValue(null);
    await captured.processor!({ data: { rawEmail: "plain email with no xml" } });
    expect(mockDmarcReportUpsert).not.toHaveBeenCalled();
  });

  it("does nothing when parseDmarcXml returns null", async () => {
    mockParseDmarc.mockResolvedValue(null);
    await captured.processor!({ data: { tenantId: "t-1", xmlReport: "<bad/>" } });
    expect(mockDmarcReportUpsert).not.toHaveBeenCalled();
  });

  it("returns early when no tenantId can be resolved", async () => {
    mockDomainFindFirst.mockResolvedValue(null);
    await captured.processor!({ data: { xmlReport: "<feedback/>" } });
    expect(mockDmarcReportUpsert).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  it("upserts a DmarcReport when xmlReport is provided with a tenantId", async () => {
    await captured.processor!({ data: { tenantId: "t-1", xmlReport: "<xml/>" } });
    expect(mockParseDmarc).toHaveBeenCalledWith("<xml/>");
    expect(mockDmarcReportUpsert).toHaveBeenCalledOnce();
  });

  it("calls extractXmlFromEmail when only rawEmail is supplied", async () => {
    mockExtractXml.mockReturnValue("<feedback/>");
    await captured.processor!({ data: { tenantId: "t-1", rawEmail: "raw mime email" } });
    expect(mockExtractXml).toHaveBeenCalledWith("raw mime email");
    expect(mockParseDmarc).toHaveBeenCalledWith("<feedback/>");
  });

  it("stores passCount and failCount from analysis", async () => {
    await captured.processor!({ data: { tenantId: "t-1", xmlReport: "<xml/>" } });
    expect(mockDmarcReportUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ passCount: 10, failCount: 0 }),
      })
    );
  });

  it("stores _analysis inside the parsed JSON payload", async () => {
    await captured.processor!({ data: { tenantId: "t-1", xmlReport: "<xml/>" } });
    expect(mockDmarcReportUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          parsed: expect.objectContaining({
            _analysis: MOCK_ANALYSIS,
          }),
        }),
      })
    );
  });

  it("stores the raw XML in the create payload", async () => {
    await captured.processor!({ data: { tenantId: "t-1", xmlReport: "<xml/>" } });
    expect(mockDmarcReportUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ rawXml: "<xml/>" }),
      })
    );
  });

  it("stores reportingOrg and reportId from report_metadata", async () => {
    await captured.processor!({ data: { tenantId: "t-1", xmlReport: "<xml/>" } });
    expect(mockDmarcReportUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reportingOrg: "Google", reportId: "rpt-001" }),
      })
    );
  });

  // ── tenantId resolution ───────────────────────────────────────────────────
  it("looks up tenantId from domain when not in job data", async () => {
    mockDomainFindFirst.mockResolvedValue({ tenantId: "t-from-db" });
    await captured.processor!({ data: { xmlReport: "<xml/>" } });
    expect(mockDomainFindFirst).toHaveBeenCalled();
    expect(mockDmarcReportUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tenantId: "t-from-db" }),
      })
    );
  });

  // ── Upsert key ────────────────────────────────────────────────────────────
  it("uses tenantId_reportId as the upsert unique key", async () => {
    await captured.processor!({ data: { tenantId: "t-1", xmlReport: "<xml/>" } });
    expect(mockDmarcReportUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_reportId: { tenantId: "t-1", reportId: "rpt-001" } },
      })
    );
  });

  // ── Update payload ────────────────────────────────────────────────────────
  it("includes parsed and counts in the update payload", async () => {
    await captured.processor!({ data: { tenantId: "t-1", xmlReport: "<xml/>" } });
    expect(mockDmarcReportUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          passCount: 10,
          failCount: 0,
          parsed: expect.objectContaining({ _analysis: MOCK_ANALYSIS }),
        }),
      })
    );
  });
});
