import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockCreateOrUpdate = vi.hoisted(() => vi.fn());
const mockDelete         = vi.hoisted(() => vi.fn());
const mockGet            = vi.hoisted(() => vi.fn());

vi.mock("@azure/arm-dns", () => ({
  DnsManagementClient: vi.fn().mockImplementation(function (this: any) {
    this.recordSets = {
      createOrUpdate: mockCreateOrUpdate,
      delete:         mockDelete,
      get:            mockGet,
    };
  }),
}));

vi.mock("@azure/identity", () => ({
  ClientSecretCredential: vi.fn().mockImplementation(function (this: any) {}),
}));

import { AzureDnsProvider } from "./azure";

const ZONE  = "example.com";
const CREDS = {
  tenantId:       "tenant-abc",
  clientId:       "client-abc",
  clientSecret:   "secret-abc",
  subscriptionId: "sub-abc",
  resourceGroup:  "rg-mailwarm",
};

function makeProvider() {
  return new AzureDnsProvider(CREDS);
}

function record(overrides?: object) {
  return { name: "@", type: "TXT" as const, value: "v=spf1 ~all", ttl: 300, ...overrides };
}

describe("AzureDnsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateOrUpdate.mockResolvedValue({});
    mockDelete.mockResolvedValue({});
  });

  // ── createRecord ──────────────────────────────────────────────────────────
  it("calls recordSets.createOrUpdate for a TXT record with the correct shape", async () => {
    await makeProvider().createRecord(ZONE, record({ name: "_dmarc", type: "TXT", value: "v=DMARC1; p=reject", ttl: 600 }));
    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      CREDS.resourceGroup, ZONE, "_dmarc", "TXT",
      expect.objectContaining({ tTL: 600, txtRecords: [{ value: ["v=DMARC1; p=reject"] }] })
    );
  });

  it("calls recordSets.createOrUpdate for an MX record with preference and exchange", async () => {
    await makeProvider().createRecord(ZONE, record({ name: "@", type: "MX", value: "10 mail.example.com", ttl: 300 }));
    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      CREDS.resourceGroup, ZONE, "@", "MX",
      expect.objectContaining({ mxRecords: [{ preference: 10, exchange: "mail.example.com" }] })
    );
  });

  it("calls recordSets.createOrUpdate for a CNAME record", async () => {
    await makeProvider().createRecord(ZONE, record({ name: "www", type: "CNAME", value: "example.com", ttl: 300 }));
    expect(mockCreateOrUpdate).toHaveBeenCalledWith(
      CREDS.resourceGroup, ZONE, "www", "CNAME",
      expect.objectContaining({ cnameRecord: { cname: "example.com" } })
    );
  });

  it("returns a composite ID of zone/type/name", async () => {
    const id = await makeProvider().createRecord(ZONE, record({ name: "_dmarc", type: "TXT" }));
    expect(id).toBe(`${ZONE}/TXT/_dmarc`);
  });

  it("uses '@' as the record name when name is '@'", async () => {
    await makeProvider().createRecord(ZONE, record({ name: "@", type: "TXT" }));
    const callArgs = mockCreateOrUpdate.mock.calls[0];
    expect(callArgs[2]).toBe("@");
  });

  // ── deleteRecord ──────────────────────────────────────────────────────────
  it("calls recordSets.delete with the correct resource group, zone, name, and type", async () => {
    await makeProvider().deleteRecord(ZONE, `${ZONE}/TXT/_dmarc`);
    expect(mockDelete).toHaveBeenCalledWith(CREDS.resourceGroup, ZONE, "_dmarc", "TXT");
  });

  // ── verifyRecord ──────────────────────────────────────────────────────────
  it("returns true when recordSets.get succeeds", async () => {
    mockGet.mockResolvedValue({ name: "_dmarc", type: "TXT" });
    const ok = await makeProvider().verifyRecord(ZONE, record({ name: "_dmarc", type: "TXT" }));
    expect(ok).toBe(true);
  });

  it("returns false when recordSets.get throws (record not found)", async () => {
    mockGet.mockRejectedValue(new Error("Not found"));
    const ok = await makeProvider().verifyRecord(ZONE, record());
    expect(ok).toBe(false);
  });

  it("uses '@' name in the get call when record name is '@'", async () => {
    mockGet.mockResolvedValue({});
    await makeProvider().verifyRecord(ZONE, record({ name: "@", type: "TXT" }));
    expect(mockGet).toHaveBeenCalledWith(CREDS.resourceGroup, ZONE, "@", "TXT");
  });
});
