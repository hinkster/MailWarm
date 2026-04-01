import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockSend = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-route-53", () => ({
  Route53Client: vi.fn().mockImplementation(function (this: any) { this.send = mockSend; }),
  ChangeResourceRecordSetsCommand: vi.fn().mockImplementation(function (this: any, input: any) { this.input = input; }),
  ListResourceRecordSetsCommand:   vi.fn().mockImplementation(function (this: any, input: any) { this.input = input; }),
}));

import { Route53DnsProvider } from "./route53";
import {
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";

const ZONE  = "Z1234567890";
const CREDS = { accessKeyId: "AKID", secretAccessKey: "SECRET" };

function makeProvider() {
  return new Route53DnsProvider(CREDS);
}

function record(overrides?: object) {
  return { name: "_dmarc", type: "TXT" as const, value: "v=DMARC1; p=reject", ttl: 300, ...overrides };
}

describe("Route53DnsProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── createRecord ──────────────────────────────────────────────────────────
  it("sends a ChangeResourceRecordSetsCommand (UPSERT action)", async () => {
    mockSend.mockResolvedValue({});
    await makeProvider().createRecord(ZONE, record());
    expect(ChangeResourceRecordSetsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        HostedZoneId: ZONE,
        ChangeBatch: expect.objectContaining({
          Changes: expect.arrayContaining([
            expect.objectContaining({ Action: "UPSERT" }),
          ]),
        }),
      })
    );
  });

  it("returns a composite ID of zone/type/name", async () => {
    mockSend.mockResolvedValue({});
    const id = await makeProvider().createRecord(ZONE, record({ name: "_dmarc", type: "TXT" }));
    expect(id).toBe(`${ZONE}/TXT/_dmarc`);
  });

  it("wraps TXT values in double-quotes", async () => {
    mockSend.mockResolvedValue({});
    await makeProvider().createRecord(ZONE, record({ type: "TXT", value: "v=spf1 ~all" }));
    const cmd = (ChangeResourceRecordSetsCommand as any).mock.calls[0][0];
    const rr = cmd.ChangeBatch.Changes[0].ResourceRecordSet.ResourceRecords[0];
    expect(rr.Value).toBe('"v=spf1 ~all"');
  });

  it("does NOT wrap MX values in quotes", async () => {
    mockSend.mockResolvedValue({});
    await makeProvider().createRecord(ZONE, record({ type: "MX", value: "10 mail.example.com" }));
    const cmd = (ChangeResourceRecordSetsCommand as any).mock.calls[0][0];
    const rr = cmd.ChangeBatch.Changes[0].ResourceRecordSet.ResourceRecords[0];
    expect(rr.Value).toBe("10 mail.example.com");
  });

  // ── deleteRecord ──────────────────────────────────────────────────────────
  it("sends a ChangeResourceRecordSetsCommand with DELETE action", async () => {
    mockSend.mockResolvedValue({});
    const recordId = `${ZONE}/TXT/_dmarc`;
    await makeProvider().deleteRecord(ZONE, recordId);
    expect(ChangeResourceRecordSetsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        ChangeBatch: expect.objectContaining({
          Changes: expect.arrayContaining([
            expect.objectContaining({ Action: "DELETE" }),
          ]),
        }),
      })
    );
  });

  // ── verifyRecord ──────────────────────────────────────────────────────────
  it("sends a ListResourceRecordSetsCommand with correct parameters", async () => {
    mockSend.mockResolvedValue({ ResourceRecordSets: [{ Name: "_dmarc", Type: "TXT" }] });
    await makeProvider().verifyRecord(ZONE, record());
    expect(ListResourceRecordSetsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        HostedZoneId:    ZONE,
        StartRecordName: "_dmarc",
        StartRecordType: "TXT",
        MaxItems:        1,
      })
    );
  });

  it("returns true when ResourceRecordSets is non-empty", async () => {
    mockSend.mockResolvedValue({ ResourceRecordSets: [{ Name: "_dmarc" }] });
    expect(await makeProvider().verifyRecord(ZONE, record())).toBe(true);
  });

  it("returns false when ResourceRecordSets is empty", async () => {
    mockSend.mockResolvedValue({ ResourceRecordSets: [] });
    expect(await makeProvider().verifyRecord(ZONE, record())).toBe(false);
  });

  it("returns false when ResourceRecordSets is absent", async () => {
    mockSend.mockResolvedValue({});
    expect(await makeProvider().verifyRecord(ZONE, record())).toBe(false);
  });
});
