import { describe, it, expect } from "vitest";
import {
  getTierLimits,
  canUseSso,
  canUseWebhooks,
  canUseGraphql,
  TIER_LIMITS,
  TIER_PRICING,
} from "./tiers";

describe("getTierLimits", () => {
  it("returns correct limits for STARTER", () => {
    const limits = getTierLimits("STARTER");
    expect(limits.maxDomains).toBe(3);
    expect(limits.maxDailyEmails).toBe(500);
    expect(limits.sso).toBe(false);
    expect(limits.webhooks).toBe(false);
    expect(limits.graphqlApi).toBe(false);
    expect(limits.maxWebhooks).toBe(0);
  });

  it("returns correct limits for GROWTH", () => {
    const limits = getTierLimits("GROWTH");
    expect(limits.maxDomains).toBe(10);
    expect(limits.webhooks).toBe(true);
    expect(limits.graphqlApi).toBe(true);
    expect(limits.sso).toBe(false);
    expect(limits.maxWebhooks).toBe(5);
  });

  it("returns correct limits for PRO", () => {
    const limits = getTierLimits("PRO");
    expect(limits.sso).toBe(true);
    expect(limits.customWarmingSchedule).toBe(true);
    expect(limits.maxDomains).toBe(35);
    expect(limits.sla).toBe("99.5");
  });

  it("returns Infinity limits for ENTERPRISE", () => {
    const limits = getTierLimits("ENTERPRISE");
    expect(limits.maxDomains).toBe(Infinity);
    expect(limits.maxMailboxesPerDomain).toBe(Infinity);
    expect(limits.maxDailyEmails).toBe(Infinity);
    expect(limits.maxSeats).toBe(Infinity);
    expect(limits.sla).toBe("99.9");
    expect(limits.dedicatedIps).toBe(true);
    expect(limits.whiteLabel).toBe(true);
  });

  it("each tier's limits are a superset of lower tiers for numeric caps", () => {
    const order = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;
    const numericKeys = [
      "maxDomains",
      "maxMailboxesPerDomain",
      "maxDailyEmails",
      "maxSeats",
      "maxApiKeys",
    ] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = getTierLimits(order[i - 1]);
      const higher = getTierLimits(order[i]);
      for (const key of numericKeys) {
        expect(higher[key]).toBeGreaterThanOrEqual(lower[key]);
      }
    }
  });
});

describe("canUseSso", () => {
  it("returns false for STARTER and GROWTH", () => {
    expect(canUseSso("STARTER")).toBe(false);
    expect(canUseSso("GROWTH")).toBe(false);
  });

  it("returns true for PRO and ENTERPRISE", () => {
    expect(canUseSso("PRO")).toBe(true);
    expect(canUseSso("ENTERPRISE")).toBe(true);
  });
});

describe("canUseWebhooks", () => {
  it("returns false for STARTER", () => {
    expect(canUseWebhooks("STARTER")).toBe(false);
  });

  it("returns true for GROWTH and above", () => {
    expect(canUseWebhooks("GROWTH")).toBe(true);
    expect(canUseWebhooks("PRO")).toBe(true);
    expect(canUseWebhooks("ENTERPRISE")).toBe(true);
  });
});

describe("canUseGraphql", () => {
  it("returns false for STARTER", () => {
    expect(canUseGraphql("STARTER")).toBe(false);
  });

  it("returns true for GROWTH and above", () => {
    expect(canUseGraphql("GROWTH")).toBe(true);
    expect(canUseGraphql("PRO")).toBe(true);
    expect(canUseGraphql("ENTERPRISE")).toBe(true);
  });
});

describe("TIER_LIMITS shape", () => {
  const tiers = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;

  it("all tiers have required keys", () => {
    const requiredKeys: (keyof (typeof TIER_LIMITS)["STARTER"])[] = [
      "maxDomains",
      "maxMailboxesPerDomain",
      "maxDailyEmails",
      "maxSeats",
      "maxWebhooks",
      "maxApiKeys",
      "sso",
      "graphqlApi",
      "webhooks",
    ];
    for (const tier of tiers) {
      for (const key of requiredKeys) {
        expect(TIER_LIMITS[tier]).toHaveProperty(key);
      }
    }
  });
});

describe("TIER_PRICING", () => {
  it("ENTERPRISE has null pricing (custom)", () => {
    expect(TIER_PRICING.ENTERPRISE.monthly).toBeNull();
    expect(TIER_PRICING.ENTERPRISE.annual).toBeNull();
  });

  it("all non-enterprise tiers have positive pricing", () => {
    expect(TIER_PRICING.STARTER.monthly).toBeGreaterThan(0);
    expect(TIER_PRICING.GROWTH.monthly).toBeGreaterThan(0);
    expect(TIER_PRICING.PRO.monthly).toBeGreaterThan(0);
  });

  it("annual price is lower than monthly for all paid tiers", () => {
    const tiers = ["STARTER", "GROWTH", "PRO"] as const;
    for (const tier of tiers) {
      expect(TIER_PRICING[tier].annual).toBeLessThan(TIER_PRICING[tier].monthly!);
    }
  });
});
