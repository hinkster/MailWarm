import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────
const captured = vi.hoisted(() => ({
  processor: undefined as ((job: any) => Promise<void>) | undefined,
}));

const mockCreateRecord = vi.hoisted(() => vi.fn());
const mockVerifyRecord = vi.hoisted(() => vi.fn());
const mockGetDnsProvider = vi.hoisted(() =>
  vi.fn().mockReturnValue({ createRecord: mockCreateRecord, verifyRecord: mockVerifyRecord })
);
const mockBuildAllRecords = vi.hoisted(() => vi.fn());
const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({}));

const mockDomainFindUnique  = vi.hoisted(() => vi.fn());
const mockDomainUpdate      = vi.hoisted(() => vi.fn());
const mockDnsConfigFind     = vi.hoisted(() => vi.fn());
const mockDnsRecordUpsert   = vi.hoisted(() => vi.fn());
const mockDnsRecordUpdate   = vi.hoisted(() => vi.fn());

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
    domain:           { findUnique: mockDomainFindUnique, update: mockDomainUpdate },
    dnsConfiguration: { findUnique: mockDnsConfigFind },
    dnsRecord:        { upsert: mockDnsRecordUpsert, update: mockDnsRecordUpdate },
  },
}));

vi.mock("../services/dns", () => ({
  getDnsProvider: mockGetDnsProvider,
}));

vi.mock("@mailwarm/shared/src/constants/dns-records", () => ({
  buildAllRecords: mockBuildAllRecords,
}));

vi.mock("../queues", () => ({
  DnsProvisionQueue: { add: mockQueueAdd },
}));

// Trigger module load
import "./dns-provision.worker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const MOCK_RECORDS = [
  { name: "@",                type: "TXT", value: "v=spf1 ~all",     ttl: 300 },
  { name: "mail._domainkey",  type: "TXT", value: "v=DKIM1; p=abc",  ttl: 300 },
  { name: "_dmarc",           type: "TXT", value: "v=DMARC1; p=reject", ttl: 300 },
];

function makeDomain(overrides?: object) {
  return { id: "d-1", name: "example.com", ...overrides };
}

function makeDnsConfig(overrides?: object) {
  return {
    id:       "cfg-1",
    provider: "CLOUDFLARE",
    zoneId:   "zone-abc",
    records:  [] as any[],
    ...overrides,
  };
}

function makeDbRecord(overrides?: object) {
  return { id: "rec-1", type: "TXT", name: "@", value: "v=spf1 ~all", ttl: 300, ...overrides };
}

function makeProvisionJob(overrides?: object) {
  return {
    name: "provision-records",
    data: {
      domainId:    "d-1",
      dnsConfigId: "cfg-1",
      tenantId:    "t-1",
      provider:    "CLOUDFLARE",
      credentials: { apiToken: "tok-123" },
      ...overrides,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("dns-provision worker — provision-records (MANUAL)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAllRecords.mockReturnValue(MOCK_RECORDS);
    mockDnsRecordUpsert.mockResolvedValue({});
    mockDnsRecordUpdate.mockResolvedValue({});
    mockDomainUpdate.mockResolvedValue({});
  });

  it("returns early when domain is not found", async () => {
    mockDomainFindUnique.mockResolvedValue(null);
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig());

    await captured.processor!(makeProvisionJob({ provider: "MANUAL" }));

    expect(mockDnsRecordUpsert).not.toHaveBeenCalled();
  });

  it("returns early when dnsConfig is not found", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockDnsConfigFind.mockResolvedValue(null);

    await captured.processor!(makeProvisionJob({ provider: "MANUAL" }));

    expect(mockDnsRecordUpsert).not.toHaveBeenCalled();
  });

  it("upserts all built records with status PENDING for MANUAL provider", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ provider: "MANUAL", records: [] }));

    await captured.processor!(makeProvisionJob({ provider: "MANUAL" }));

    expect(mockDnsRecordUpsert).toHaveBeenCalledTimes(MOCK_RECORDS.length);
    for (const call of mockDnsRecordUpsert.mock.calls) {
      expect(call[0].create.status).toBe("PENDING");
      expect(call[0].update.status).toBe("PENDING");
    }
  });

  it("does NOT call getDnsProvider for MANUAL", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ provider: "MANUAL", records: [] }));

    await captured.processor!(makeProvisionJob({ provider: "MANUAL" }));

    expect(mockGetDnsProvider).not.toHaveBeenCalled();
  });
});

describe("dns-provision worker — provision-records (provider)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAllRecords.mockReturnValue(MOCK_RECORDS);
    mockDnsRecordUpsert.mockResolvedValue({});
    mockDomainUpdate.mockResolvedValue({});
    mockQueueAdd.mockResolvedValue({});
  });

  it("calls getDnsProvider with the correct provider and credentials", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ records: [] }));
    mockCreateRecord.mockResolvedValue("prov-rec-id");

    await captured.processor!(makeProvisionJob({ provider: "CLOUDFLARE", credentials: { apiToken: "tok-xyz" } }));

    expect(mockGetDnsProvider).toHaveBeenCalledWith("CLOUDFLARE", { apiToken: "tok-xyz" });
  });

  it("calls createRecord for each built record", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ records: [] }));
    mockCreateRecord.mockResolvedValue("prov-rec-id");

    await captured.processor!(makeProvisionJob());

    expect(mockCreateRecord).toHaveBeenCalledTimes(MOCK_RECORDS.length);
  });

  it("upserts DB records with status PROVISIONED and providerRecordId on success", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ records: [] }));
    mockCreateRecord.mockResolvedValue("prov-id-123");

    await captured.processor!(makeProvisionJob());

    for (const call of mockDnsRecordUpsert.mock.calls) {
      expect(call[0].create.status).toBe("PROVISIONED");
      expect(call[0].create.providerRecordId).toBe("prov-id-123");
    }
  });

  it("marks existing record as FAILED when createRecord throws", async () => {
    const existingRec = makeDbRecord();
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    // dnsConfig has one existing record that matches the first MOCK_RECORD
    mockDnsConfigFind.mockResolvedValue(
      makeDnsConfig({ records: [{ ...existingRec, type: "TXT", name: "@" }] })
    );
    mockCreateRecord.mockRejectedValueOnce(new Error("API error")).mockResolvedValue("ok");

    await captured.processor!(makeProvisionJob());

    expect(mockDnsRecordUpdate).toHaveBeenCalledWith({
      where: { id: existingRec.id },
      data:  { status: "FAILED" },
    });
  });

  it("does NOT call dnsRecord.update when createRecord fails and no existing record", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ records: [] }));
    mockCreateRecord.mockRejectedValue(new Error("API error"));

    await captured.processor!(makeProvisionJob());

    expect(mockDnsRecordUpdate).not.toHaveBeenCalled();
  });

  it("schedules a verify-records job after provisioning", async () => {
    mockDomainFindUnique.mockResolvedValue(makeDomain());
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ records: [] }));
    mockCreateRecord.mockResolvedValue("prov-id");

    await captured.processor!(makeProvisionJob());

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "verify-records",
      { domainId: "d-1", dnsConfigId: "cfg-1" },
      expect.objectContaining({ delay: 60_000 })
    );
  });
});

describe("dns-provision worker — verify-records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDomainUpdate.mockResolvedValue({});
    mockDnsRecordUpdate.mockResolvedValue({});
  });

  it("returns early when dnsConfig is not found", async () => {
    mockDnsConfigFind.mockResolvedValue(null);
    await captured.processor!({ name: "verify-records", data: { domainId: "d-1", dnsConfigId: "cfg-1" } });
    expect(mockVerifyRecord).not.toHaveBeenCalled();
  });

  it("returns early when provider is MANUAL", async () => {
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ provider: "MANUAL", records: [makeDbRecord()] }));
    await captured.processor!({ name: "verify-records", data: { domainId: "d-1", dnsConfigId: "cfg-1" } });
    expect(mockVerifyRecord).not.toHaveBeenCalled();
  });

  it("calls verifyRecord for each record in the config", async () => {
    mockDnsConfigFind.mockResolvedValue(
      makeDnsConfig({ records: [makeDbRecord("rec-1"), makeDbRecord("rec-2")] })
    );
    mockVerifyRecord.mockResolvedValue(true);

    await captured.processor!({ name: "verify-records", data: { domainId: "d-1", dnsConfigId: "cfg-1" } });

    expect(mockVerifyRecord).toHaveBeenCalledTimes(2);
  });

  it("updates record status to VERIFIED and sets verifiedAt when verified", async () => {
    const rec = makeDbRecord();
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ records: [rec] }));
    mockVerifyRecord.mockResolvedValue(true);

    await captured.processor!({ name: "verify-records", data: { domainId: "d-1", dnsConfigId: "cfg-1" } });

    expect(mockDnsRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: rec.id },
        data:  expect.objectContaining({ status: "VERIFIED", verifiedAt: expect.any(Date) }),
      })
    );
  });

  it("updates record status to PROVISIONED with null verifiedAt when not verified", async () => {
    const rec = makeDbRecord();
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ records: [rec] }));
    mockVerifyRecord.mockResolvedValue(false);

    await captured.processor!({ name: "verify-records", data: { domainId: "d-1", dnsConfigId: "cfg-1" } });

    expect(mockDnsRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROVISIONED", verifiedAt: null }),
      })
    );
  });

  it("marks domain as VERIFIED when all records pass", async () => {
    mockDnsConfigFind.mockResolvedValue(makeDnsConfig({ records: [makeDbRecord()] }));
    mockVerifyRecord.mockResolvedValue(true);

    await captured.processor!({ name: "verify-records", data: { domainId: "d-1", dnsConfigId: "cfg-1" } });

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1" },
        data:  expect.objectContaining({ status: "VERIFIED", verifiedAt: expect.any(Date) }),
      })
    );
  });

  it("does NOT mark domain as VERIFIED when any record fails", async () => {
    mockDnsConfigFind.mockResolvedValue(
      makeDnsConfig({ records: [makeDbRecord("r1"), makeDbRecord("r2")] })
    );
    mockVerifyRecord.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await captured.processor!({ name: "verify-records", data: { domainId: "d-1", dnsConfigId: "cfg-1" } });

    expect(mockDomainUpdate).not.toHaveBeenCalled();
  });
});

describe("dns-provision worker — verify-domain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDomainUpdate.mockResolvedValue({});
    delete process.env.NODE_ENV;
  });

  it("returns early when domain is not found", async () => {
    mockDomainFindUnique.mockResolvedValue(null);
    await captured.processor!({ name: "verify-domain", data: { domainId: "d-1" } });
    expect(mockDomainUpdate).not.toHaveBeenCalled();
  });

  it("auto-verifies domain in non-production environments", async () => {
    process.env.NODE_ENV = "test";
    mockDomainFindUnique.mockResolvedValue(makeDomain());

    await captured.processor!({ name: "verify-domain", data: { domainId: "d-1" } });

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1" },
        data:  expect.objectContaining({ status: "VERIFIED", verifiedAt: expect.any(Date) }),
      })
    );
  });

  it("does NOT auto-verify in production", async () => {
    process.env.NODE_ENV = "production";
    mockDomainFindUnique.mockResolvedValue(makeDomain());

    await captured.processor!({ name: "verify-domain", data: { domainId: "d-1" } });

    expect(mockDomainUpdate).not.toHaveBeenCalled();
  });
});
