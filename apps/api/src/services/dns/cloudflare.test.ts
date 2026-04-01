import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudflareDnsProvider } from "./cloudflare";

const ZONE   = "zone-abc123";
const TOKEN  = "cf-api-token";

function makeProvider() {
  return new CloudflareDnsProvider({ apiToken: TOKEN });
}

function mockFetch(payload: { success: boolean; result?: any; errors?: any[] }) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(payload),
  });
}

function record(overrides?: object) {
  return { name: "@", type: "TXT" as const, value: "v=spf1 ~all", ttl: 300, ...overrides };
}

describe("CloudflareDnsProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── createRecord ──────────────────────────────────────────────────────────
  it("POSTs to the correct Cloudflare endpoint", async () => {
    mockFetch({ success: true, result: { id: "cf-rec-1" } });
    const p = makeProvider();
    await p.createRecord(ZONE, record());
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends the Bearer token in the Authorization header", async () => {
    mockFetch({ success: true, result: { id: "cf-rec-1" } });
    await makeProvider().createRecord(ZONE, record());
    const opts = (global.fetch as any).mock.calls[0][1];
    expect(opts.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("returns the provider record ID from the response", async () => {
    mockFetch({ success: true, result: { id: "cf-rec-42" } });
    const id = await makeProvider().createRecord(ZONE, record());
    expect(id).toBe("cf-rec-42");
  });

  it("throws when the Cloudflare API returns success:false", async () => {
    mockFetch({ success: false, errors: [{ message: "Invalid zone" }] });
    await expect(makeProvider().createRecord(ZONE, record())).rejects.toThrow("Cloudflare API error");
  });

  it("sends name, type, content, and ttl in the body", async () => {
    mockFetch({ success: true, result: { id: "id" } });
    await makeProvider().createRecord(ZONE, record({ name: "_dmarc", type: "TXT", value: "v=DMARC1", ttl: 600 }));
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toMatchObject({ name: "_dmarc", type: "TXT", content: "v=DMARC1", ttl: 600 });
  });

  // ── deleteRecord ──────────────────────────────────────────────────────────
  it("sends a DELETE request for the correct record URL", async () => {
    mockFetch({ success: true, result: {} });
    await makeProvider().deleteRecord(ZONE, "rec-id-99");
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records/rec-id-99`,
      expect.objectContaining({ method: "DELETE" })
    );
  });

  // ── verifyRecord ──────────────────────────────────────────────────────────
  it("returns true when the API returns at least one matching record", async () => {
    mockFetch({ success: true, result: [{ id: "cf-rec-1" }] });
    const ok = await makeProvider().verifyRecord(ZONE, record());
    expect(ok).toBe(true);
  });

  it("returns false when the API returns an empty array", async () => {
    mockFetch({ success: true, result: [] });
    const ok = await makeProvider().verifyRecord(ZONE, record());
    expect(ok).toBe(false);
  });

  it("sends a GET request with type and name query params", async () => {
    mockFetch({ success: true, result: [] });
    await makeProvider().verifyRecord(ZONE, record({ name: "_dmarc", type: "TXT" }));
    const url: string = (global.fetch as any).mock.calls[0][0];
    expect(url).toContain("type=TXT");
    expect(url).toContain("name=_dmarc");
  });
});
