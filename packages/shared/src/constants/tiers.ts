import { TierName } from "@prisma/client";

export interface TierLimits {
  maxDomains: number;
  maxMailboxesPerDomain: number;
  maxDailyEmails: number;
  maxSeats: number;
  maxWebhooks: number;
  maxApiKeys: number;
  inboxPlacementTestsPerMonth: number;
  auditLogRetentionDays: number;
  dnsProviders: number; // max number of DNS providers
  sso: boolean;
  graphqlApi: boolean;
  webhooks: boolean;
  customWarmingSchedule: boolean;
  dedicatedIps: boolean;
  whiteLabel: boolean;
  dmarcReporting: "basic" | "full" | "full_alerts" | "full_forwarding";
  bounceAnalytics: boolean;
  warmingPool: "shared_s" | "shared_m" | "shared_plus" | "dedicated";
  sla: null | "99.5" | "99.9";
}

export const TIER_LIMITS: Record<TierName, TierLimits> = {
  STARTER: {
    maxDomains: 3,
    maxMailboxesPerDomain: 2,
    maxDailyEmails: 500,
    maxSeats: 2,
    maxWebhooks: 0,
    maxApiKeys: 2,
    inboxPlacementTestsPerMonth: 0,
    auditLogRetentionDays: 0,
    dnsProviders: 1,
    sso: false,
    graphqlApi: false,
    webhooks: false,
    customWarmingSchedule: false,
    dedicatedIps: false,
    whiteLabel: false,
    dmarcReporting: "basic",
    bounceAnalytics: false,
    warmingPool: "shared_s",
    sla: null,
  },
  GROWTH: {
    maxDomains: 10,
    maxMailboxesPerDomain: 5,
    maxDailyEmails: 5000,
    maxSeats: 5,
    maxWebhooks: 5,
    maxApiKeys: 10,
    inboxPlacementTestsPerMonth: 5,
    auditLogRetentionDays: 30,
    dnsProviders: 2,
    sso: false,
    graphqlApi: true,
    webhooks: true,
    customWarmingSchedule: false, // limited presets only
    dedicatedIps: false,
    whiteLabel: false,
    dmarcReporting: "full",
    bounceAnalytics: true,
    warmingPool: "shared_m",
    sla: null,
  },
  PRO: {
    maxDomains: 35,
    maxMailboxesPerDomain: 15,
    maxDailyEmails: 25000,
    maxSeats: 20,
    maxWebhooks: 20,
    maxApiKeys: 50,
    inboxPlacementTestsPerMonth: 25,
    auditLogRetentionDays: 90,
    dnsProviders: 3,
    sso: true, // ← Key differentiator
    graphqlApi: true,
    webhooks: true,
    customWarmingSchedule: true,
    dedicatedIps: false,
    whiteLabel: false,
    dmarcReporting: "full_alerts",
    bounceAnalytics: true,
    warmingPool: "shared_plus",
    sla: "99.5",
  },
  ENTERPRISE: {
    maxDomains: Infinity,
    maxMailboxesPerDomain: Infinity,
    maxDailyEmails: Infinity,
    maxSeats: Infinity,
    maxWebhooks: Infinity,
    maxApiKeys: Infinity,
    inboxPlacementTestsPerMonth: Infinity,
    auditLogRetentionDays: 365,
    dnsProviders: 3,
    sso: true,
    graphqlApi: true,
    webhooks: true,
    customWarmingSchedule: true,
    dedicatedIps: true,
    whiteLabel: true,
    dmarcReporting: "full_forwarding",
    bounceAnalytics: true,
    warmingPool: "dedicated",
    sla: "99.9",
  },
};

export const TIER_PRICING = {
  STARTER:    { monthly: 4900,  annual: 3900  }, // cents
  GROWTH:     { monthly: 14900, annual: 11900 },
  PRO:        { monthly: 39900, annual: 31900 },
  ENTERPRISE: { monthly: null,  annual: null  }, // custom
} as const;

export function getTierLimits(tier: TierName): TierLimits {
  return TIER_LIMITS[tier];
}

export function canUseSso(tier: TierName): boolean {
  return TIER_LIMITS[tier].sso;
}

export function canUseGraphql(tier: TierName): boolean {
  return TIER_LIMITS[tier].graphqlApi;
}

export function canUseWebhooks(tier: TierName): boolean {
  return TIER_LIMITS[tier].webhooks;
}
