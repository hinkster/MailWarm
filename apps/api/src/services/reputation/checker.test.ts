import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted DNS mocks ─────────────────────────────────────────────────────────
const mockResolveTxt = vi.hoisted(() => vi.fn());
const mockResolveMx  = vi.hoisted(() => vi.fn());
const mockResolve4   = vi.hoisted(() => vi.fn());

vi.mock("dns/promises", () => ({
  default: {
    resolveTxt: mockResolveTxt,
    resolveMx:  mockResolveMx,
    resolve4:   mockResolve4,
  },
}));

import { runReputationCheck } from "./checker";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makePrisma(rows: Array<{ type: string; count: number }> = []) {
  return {
    emailEvent: {
      groupBy: vi.fn().mockResolvedValue(
        rows.map((r) => ({ type: r.type, _count: { type: r.count } }))
      ),
    },
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("runReputationCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all DNS lookups fail (NXDOMAIN) → nothing present / not listed
    mockResolveTxt.mockRejectedValue(new Error("NXDOMAIN"));
    mockResolveMx.mockRejectedValue(new Error("NXDOMAIN"));
    mockResolve4.mockRejectedValue(new Error("NXDOMAIN"));
  });

  // ── Score baseline ────────────────────────────────────────────────────────
  it("returns 55 for a clean domain with no emails sent (no DNS, no blacklists, neutral metrics)", async () => {
    // DNS records: 0 pts  |  blacklists clean: 40 pts  |  neutral metrics: 15 pts  = 55
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(55);
  });

  // ── SPF ───────────────────────────────────────────────────────────────────
  it("adds 10 pts for valid SPF (-all)", async () => {
    mockResolveTxt.mockImplementation(async (name: string) => {
      if (name === "example.com") return [["v=spf1 include:mailwarm.io -all"]];
      throw new Error("NXDOMAIN");
    });
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(65);
  });

  it("adds 10 pts for valid SPF (~all)", async () => {
    mockResolveTxt.mockImplementation(async (name: string) => {
      if (name === "example.com") return [["v=spf1 include:mailwarm.io ~all"]];
      throw new Error("NXDOMAIN");
    });
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(65);
  });

  it("adds 5 pts for SPF present but missing -all / ~all", async () => {
    mockResolveTxt.mockImplementation(async (name: string) => {
      if (name === "example.com") return [["v=spf1 include:mailwarm.io"]];
      throw new Error("NXDOMAIN");
    });
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(60);
  });

  // ── DKIM ──────────────────────────────────────────────────────────────────
  it("adds 10 pts for a valid DKIM record", async () => {
    mockResolveTxt.mockImplementation(async (name: string) => {
      if (name.includes("_domainkey")) return [["v=DKIM1; k=rsa; p=abc123"]];
      throw new Error("NXDOMAIN");
    });
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(65);
  });

  // ── DMARC ─────────────────────────────────────────────────────────────────
  it("adds 10 pts for DMARC with p=reject", async () => {
    mockResolveTxt.mockImplementation(async (name: string) => {
      if (name === "_dmarc.example.com") return [["v=DMARC1; p=reject; rua=mailto:r@example.com"]];
      throw new Error("NXDOMAIN");
    });
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(65);
  });

  it("adds 10 pts for DMARC with p=quarantine", async () => {
    mockResolveTxt.mockImplementation(async (name: string) => {
      if (name === "_dmarc.example.com") return [["v=DMARC1; p=quarantine"]];
      throw new Error("NXDOMAIN");
    });
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(65);
  });

  it("adds 5 pts for DMARC with p=none (present but not valid)", async () => {
    mockResolveTxt.mockImplementation(async (name: string) => {
      if (name === "_dmarc.example.com") return [["v=DMARC1; p=none"]];
      throw new Error("NXDOMAIN");
    });
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(60);
  });

  // ── Perfect domain ─────────────────────────────────────────────────────────
  it("returns 100 for a perfect domain (all DNS valid, no blacklists, excellent metrics)", async () => {
    mockResolveTxt.mockImplementation(async (name: string) => {
      if (name === "example.com")            return [["v=spf1 include:mailwarm.io -all"]];
      if (name.includes("_domainkey"))       return [["v=DKIM1; p=abc123"]];
      if (name === "_dmarc.example.com")     return [["v=DMARC1; p=reject"]];
      throw new Error("NXDOMAIN");
    });
    // No MX → no IP blacklist checks; domain blacklists return NXDOMAIN → not listed
    const prisma = makePrisma([
      { type: "SENT",   count: 100 },
      { type: "OPENED", count: 40 },
      // no bounces, no complaints
    ]);
    const result = await runReputationCheck("example.com", "d-1", prisma);
    // SPF 10 + DKIM 10 + DMARC 10 + blacklist 40 + open≥30→15 + bounce≤1→10 + complaint=0→5 = 100
    expect(result.score).toBe(100);
  });

  // ── Blacklists ─────────────────────────────────────────────────────────────
  it("deducts full 40-pt blacklist budget when IP is listed on all IP DNSBLs", async () => {
    mockResolveMx.mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]);
    mockResolve4.mockImplementation(async (name: string) => {
      if (name === "mail.example.com") return ["1.2.3.4"];
      return ["127.0.0.2"]; // all DNSBL lookups resolve → listed
    });
    // Score: DNS 0 + blacklist 0 + neutral 15 = 15
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBe(15);
  });

  it("reports only the blacklist names that matched in listedOn", async () => {
    mockResolveMx.mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]);
    mockResolve4.mockImplementation(async (name: string) => {
      if (name === "mail.example.com") return ["1.2.3.4"];
      // Only Spamhaus ZEN query resolves (reversed IP prefix matches)
      if (name.startsWith("4.3.2.1.zen.spamhaus.org")) return ["127.0.0.2"];
      throw new Error("NXDOMAIN");
    });
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.listedOn).toEqual(["Spamhaus ZEN"]);
  });

  it("skips IP blacklist checks when domain has no MX record", async () => {
    // mockResolveMx throws → mxIp = null → ipBlacklists = []
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.signals.ipBlacklists).toHaveLength(0);
    expect(result.signals.mxIp).toBeNull();
  });

  // ── Metrics scoring ────────────────────────────────────────────────────────
  it("uses neutral 15 pts for metrics when sampleSize < 10", async () => {
    const result = await runReputationCheck("example.com", "d-1", makePrisma([{ type: "SENT", count: 5 }]));
    // DNS 0 + blacklist 40 + neutral 15 = 55 (same as no data at all)
    expect(result.score).toBe(55);
    expect(result.signals.metrics.sampleSize).toBe(5);
  });

  it("computes open / bounce / complaint rates as percentages", async () => {
    const prisma = makePrisma([
      { type: "SENT",      count: 100 },
      { type: "OPENED",    count: 25  },
      { type: "BOUNCED",   count: 3   },
      { type: "COMPLAINED",count: 1   },
    ]);
    const result = await runReputationCheck("example.com", "d-1", prisma);
    expect(result.signals.metrics.openRate).toBe(25);
    expect(result.signals.metrics.bounceRate).toBe(3);
    expect(result.signals.metrics.complaintRate).toBe(1);
  });

  it("awards 12 pts for open rate between 20 and 29", async () => {
    const prisma = makePrisma([
      { type: "SENT",   count: 100 },
      { type: "OPENED", count: 25  },
    ]);
    // DNS 0 + blacklist 40 + open 12 + bounce≤1→10 + complaint=0→5 = 67
    const result = await runReputationCheck("example.com", "d-1", prisma);
    expect(result.score).toBe(67);
  });

  it("awards 8 pts for open rate between 10 and 19", async () => {
    const prisma = makePrisma([
      { type: "SENT",   count: 100 },
      { type: "OPENED", count: 15  },
    ]);
    // DNS 0 + blacklist 40 + open 8 + bounce≤1→10 + complaint=0→5 = 63
    const result = await runReputationCheck("example.com", "d-1", prisma);
    expect(result.score).toBe(63);
  });

  it("penalises high bounce rate (> 5%) with 0 pts for bounce", async () => {
    const prisma = makePrisma([
      { type: "SENT",    count: 100 },
      { type: "OPENED",  count: 40  },
      { type: "BOUNCED", count: 10  },
    ]);
    // DNS 0 + blacklist 40 + open≥30→15 + bounce>5→0 + complaint=0→5 = 60
    const result = await runReputationCheck("example.com", "d-1", prisma);
    expect(result.score).toBe(60);
  });

  it("penalises non-zero complaint rate (< 0.1%) with 3 pts", async () => {
    const prisma = makePrisma([
      { type: "SENT",       count: 10000 },
      { type: "OPENED",     count: 4000  },
      { type: "COMPLAINED", count: 5     }, // 0.05% — under 0.1
    ]);
    // DNS 0 + blacklist 40 + open≥30→15 + bounce≤1→10 + complaint<0.1→3 = 68
    const result = await runReputationCheck("example.com", "d-1", prisma);
    expect(result.score).toBe(68);
  });

  // ── Score bounds ──────────────────────────────────────────────────────────
  it("score is always clamped to [0, 100]", async () => {
    const result = await runReputationCheck("example.com", "d-1", makePrisma());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
