import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────
const captured = vi.hoisted(() => ({
  processor: undefined as ((job: any) => Promise<void>) | undefined,
}));

const mockProvisionMailbox    = vi.hoisted(() => vi.fn().mockResolvedValue({ password: "s3cr3t" }));
const mockDeprovisionMailbox  = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGenerateDkimKeypair = vi.hoisted(() => vi.fn().mockResolvedValue({
  selector:      "mwabc123",
  privateKeyPem: "-----BEGIN RSA PRIVATE KEY-----\n...",
  publicKeyPem:  "-----BEGIN PUBLIC KEY-----\n...",
  dnsRecord:     { name: "mwabc123._domainkey", type: "TXT", value: "v=DKIM1; k=rsa; p=abc", ttl: 300, description: "" },
}));

const mockDnsConfigFindUnique = vi.hoisted(() => vi.fn());
const mockDnsConfigCreate     = vi.hoisted(() => vi.fn());
const mockDnsConfigUpdate     = vi.hoisted(() => vi.fn());
const mockDnsRecordCreate     = vi.hoisted(() => vi.fn());
const mockDomainFindUnique    = vi.hoisted(() => vi.fn());
const mockMailboxUpdate       = vi.hoisted(() => vi.fn());
const mockQueueAdd            = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(function (_queue: string, fn: any) {
    captured.processor = fn;
    return { close: vi.fn() };
  }),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn().mockImplementation(function (this: any) {}),
}));

vi.mock("@mailwarm/database", () => ({
  prisma: {
    dnsConfiguration: {
      findUnique: mockDnsConfigFindUnique,
      create:     mockDnsConfigCreate,
      update:     mockDnsConfigUpdate,
    },
    dnsRecord:  { create: mockDnsRecordCreate },
    domain:     { findUnique: mockDomainFindUnique },
    mailbox:    { update: mockMailboxUpdate },
  },
}));

vi.mock("../services/mailbox/provisioner", () => ({
  provisionMailbox:    mockProvisionMailbox,
  deprovisionMailbox:  mockDeprovisionMailbox,
  generateDkimKeypair: mockGenerateDkimKeypair,
}));

vi.mock("../queues", () => ({
  DnsProvisionQueue: { add: mockQueueAdd },
}));

// Trigger module load
import "./mailbox-provision.worker";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function provisionJob(overrides?: object) {
  return {
    name: "provision",
    data: { mailboxId: "mb-1", address: "hello@example.com", domainId: "d-1", tenantId: "t-1", ...overrides },
  };
}

function deprovisionJob(overrides?: object) {
  return {
    name: "deprovision",
    data: { mailboxId: "mb-1", address: "hello@example.com", ...overrides },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("mailbox-provision worker — provision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMailboxUpdate.mockResolvedValue({});
    mockDnsRecordCreate.mockResolvedValue({});
    mockDnsConfigUpdate.mockResolvedValue({});
    mockQueueAdd.mockResolvedValue({});
  });

  it("calls provisionMailbox with the mailbox address", async () => {
    mockDnsConfigFindUnique.mockResolvedValue({
      id: "cfg-1", records: [{ name: "existing._domainkey", value: "v=DKIM1; p=old" }],
    });

    await captured.processor!(provisionJob());

    expect(mockProvisionMailbox).toHaveBeenCalledWith("hello@example.com");
  });

  it("marks mailbox ACTIVE with the existing DKIM selector when one already exists", async () => {
    mockDnsConfigFindUnique.mockResolvedValue({
      id: "cfg-1",
      records: [{ name: "mwexist._domainkey", value: "v=DKIM1; p=abc", type: "TXT" }],
    });

    await captured.processor!(provisionJob());

    expect(mockMailboxUpdate).toHaveBeenCalledWith({
      where: { id: "mb-1" },
      data:  { status: "ACTIVE", dkimSelector: "mwexist" },
    });
    expect(mockGenerateDkimKeypair).not.toHaveBeenCalled();
  });

  it("generates a DKIM keypair when no existing DKIM record is found", async () => {
    mockDnsConfigFindUnique.mockResolvedValue({ id: "cfg-1", records: [] });
    mockDomainFindUnique.mockResolvedValue({ id: "d-1", name: "example.com" });
    mockDnsConfigUpdate.mockResolvedValue({});

    await captured.processor!(provisionJob());

    expect(mockGenerateDkimKeypair).toHaveBeenCalledWith("example.com");
  });

  it("creates a dnsConfiguration when none exists before storing the DKIM record", async () => {
    mockDnsConfigFindUnique
      .mockResolvedValueOnce(null)      // first call: no dnsConfig with records
      .mockResolvedValueOnce(null);     // second call: no dnsConfig at all
    mockDnsConfigCreate.mockResolvedValue({ id: "cfg-new", provider: "MANUAL" });
    mockDomainFindUnique.mockResolvedValue({ id: "d-1", name: "example.com" });

    await captured.processor!(provisionJob());

    expect(mockDnsConfigCreate).toHaveBeenCalledWith({
      data: { domainId: "d-1", provider: "MANUAL" },
    });
  });

  it("stores the DKIM DNS record in the database after keypair generation", async () => {
    mockDnsConfigFindUnique
      .mockResolvedValueOnce({ id: "cfg-1", records: [] })
      .mockResolvedValueOnce({ id: "cfg-1", provider: "MANUAL" });
    mockDomainFindUnique.mockResolvedValue({ id: "d-1", name: "example.com" });

    await captured.processor!(provisionJob());

    expect(mockDnsRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type:   "TXT",
          name:   "mwabc123._domainkey",
          status: "PENDING",
        }),
      })
    );
  });

  it("persists the DKIM private key on the dnsConfiguration", async () => {
    mockDnsConfigFindUnique
      .mockResolvedValueOnce({ id: "cfg-1", records: [] })
      .mockResolvedValueOnce({ id: "cfg-1", provider: "MANUAL" });
    mockDomainFindUnique.mockResolvedValue({ id: "d-1", name: "example.com" });

    await captured.processor!(provisionJob());

    expect(mockDnsConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { dkimPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\n..." },
      })
    );
  });

  it("queues DNS provisioning when provider is not MANUAL", async () => {
    mockDnsConfigFindUnique
      .mockResolvedValueOnce({ id: "cfg-1", records: [] })
      .mockResolvedValueOnce({ id: "cfg-1", provider: "CLOUDFLARE" });
    mockDomainFindUnique.mockResolvedValue({ id: "d-1", name: "example.com" });

    await captured.processor!(provisionJob());

    expect(mockQueueAdd).toHaveBeenCalledWith("provision-records", { domainId: "d-1", dnsConfigId: "cfg-1" });
  });

  it("does NOT queue DNS provisioning when provider is MANUAL", async () => {
    mockDnsConfigFindUnique
      .mockResolvedValueOnce({ id: "cfg-1", records: [] })
      .mockResolvedValueOnce({ id: "cfg-1", provider: "MANUAL" });
    mockDomainFindUnique.mockResolvedValue({ id: "d-1", name: "example.com" });

    await captured.processor!(provisionJob());

    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("suspends mailbox and rethrows when provisionMailbox throws", async () => {
    mockProvisionMailbox.mockRejectedValue(new Error("doveadm failed"));
    mockDnsConfigFindUnique.mockResolvedValue({ id: "cfg-1", records: [] });

    await expect(captured.processor!(provisionJob())).rejects.toThrow("doveadm failed");

    expect(mockMailboxUpdate).toHaveBeenCalledWith({
      where: { id: "mb-1" },
      data:  { status: "SUSPENDED" },
    });
  });
});

describe("mailbox-provision worker — deprovision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMailboxUpdate.mockResolvedValue({});
  });

  it("calls deprovisionMailbox with the mailbox address", async () => {
    await captured.processor!(deprovisionJob());
    expect(mockDeprovisionMailbox).toHaveBeenCalledWith("hello@example.com");
  });

  it("marks mailbox as DELETED", async () => {
    await captured.processor!(deprovisionJob());
    expect(mockMailboxUpdate).toHaveBeenCalledWith({
      where: { id: "mb-1" },
      data:  { status: "DELETED" },
    });
  });
});
