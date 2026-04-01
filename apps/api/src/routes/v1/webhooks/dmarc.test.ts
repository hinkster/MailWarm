import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRouteApp } from "../../../test-helpers/build-route-app";
import { dmarcInboundRoute } from "./dmarc";
import type { FastifyInstance } from "fastify";

// ─── Queue mock ────────────────────────────────────────────────────────────────
const mockQueueAdd = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("../../../queues", () => ({ DmarcIngestQueue: { add: mockQueueAdd } }));

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.DMARC_INBOUND_SECRET;
  app = await buildRouteApp(dmarcInboundRoute, {});
});

afterEach(() => app.close());

// ─── Payload validation ───────────────────────────────────────────────────────
describe("POST /dmarc — payload validation", () => {
  it("returns 400 when both xmlReport and rawEmail are missing", async () => {
    const res = await app.inject({
      method: "POST", url: "/dmarc",
      payload: { tenantId: "t-1", domain: "example.com" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a payload with xmlReport and returns 200", async () => {
    const res = await app.inject({
      method: "POST", url: "/dmarc",
      payload: { tenantId: "t-1", domain: "example.com", xmlReport: "<xml/>" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });

  it("accepts a payload with rawEmail and returns 200", async () => {
    const res = await app.inject({
      method: "POST", url: "/dmarc",
      payload: { rawEmail: "raw email content" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("queues an ingest job with the supplied fields", async () => {
    await app.inject({
      method: "POST", url: "/dmarc",
      payload: { tenantId: "t-1", domain: "example.com", xmlReport: "<xml/>" },
    });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "ingest",
      expect.objectContaining({ tenantId: "t-1", domain: "example.com", xmlReport: "<xml/>" })
    );
  });
});

// ─── Authentication ───────────────────────────────────────────────────────────
describe("POST /dmarc — authentication", () => {
  it("allows requests without a secret when DMARC_INBOUND_SECRET is not set", async () => {
    // env var absent — no auth check performed
    const res = await app.inject({
      method: "POST", url: "/dmarc",
      payload: { xmlReport: "<xml/>" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 when secret is set and X-Dmarc-Secret header is missing", async () => {
    process.env.DMARC_INBOUND_SECRET = "super-secret";
    const res = await app.inject({
      method: "POST", url: "/dmarc",
      payload: { xmlReport: "<xml/>" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Unauthorized");
  });

  it("returns 401 when secret is set and X-Dmarc-Secret header is wrong", async () => {
    process.env.DMARC_INBOUND_SECRET = "super-secret";
    const res = await app.inject({
      method: "POST", url: "/dmarc",
      headers: { "x-dmarc-secret": "wrong-secret" },
      payload: { xmlReport: "<xml/>" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 when secret is set and X-Dmarc-Secret header matches", async () => {
    process.env.DMARC_INBOUND_SECRET = "super-secret";
    const res = await app.inject({
      method: "POST", url: "/dmarc",
      headers: { "x-dmarc-secret": "super-secret" },
      payload: { xmlReport: "<xml/>" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("does not queue a job on an unauthorized request", async () => {
    process.env.DMARC_INBOUND_SECRET = "super-secret";
    await app.inject({
      method: "POST", url: "/dmarc",
      payload: { xmlReport: "<xml/>" },
    });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
