import dns from "dns/promises";
import { PrismaClient } from "@prisma/client";

// ── DNSBL definitions ─────────────────────────────────────────────────────────
// weight: how many points are deducted from the 40-point blacklist budget if listed

const IP_BLACKLISTS = [
  { name: "Spamhaus ZEN",    host: "zen.spamhaus.org",     weight: 15 },
  { name: "Barracuda",       host: "b.barracudacentral.org", weight: 12 },
  { name: "SpamCop",         host: "bl.spamcop.net",       weight: 8  },
  { name: "SORBS SPAM",      host: "spam.dnsbl.sorbs.net", weight: 6  },
  { name: "Mailspike BL",    host: "bl.mailspike.net",     weight: 5  },
  { name: "Truncate",        host: "truncate.gbudb.net",   weight: 4  },
];

const DOMAIN_BLACKLISTS = [
  { name: "Spamhaus DBL",    host: "dbl.spamhaus.org",     weight: 15 },
  { name: "URIBL",           host: "multi.uribl.com",      weight: 10 },
  { name: "SURBL",           host: "multi.surbl.org",      weight: 10 },
];

export interface BlacklistResult {
  name:    string;
  listed:  boolean;
  weight:  number;
  lookupHost: string;
}

export interface DnsRecordSignal {
  present: boolean;
  valid:   boolean;
  value:   string | null;
}

export interface MetricSignal {
  bounceRate:    number;
  complaintRate: number;
  openRate:      number;
  sampleSize:    number;
}

export interface ReputationSignals {
  spf:        DnsRecordSignal;
  dkim:       DnsRecordSignal;
  dmarc:      DnsRecordSignal;
  mxIp:       string | null;
  ipBlacklists:     BlacklistResult[];
  domainBlacklists: BlacklistResult[];
  metrics:    MetricSignal;
}

// ── DNS helpers ────────────────────────────────────────────────────────────────

async function resolveTxt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((r) => r.join(""));
  } catch {
    return [];
  }
}

async function resolveMx(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (records.length === 0) return null;
    records.sort((a, b) => a.priority - b.priority);
    const addresses = await dns.resolve4(records[0].exchange);
    return addresses[0] ?? null;
  } catch {
    return null;
  }
}

async function isListedOnDnsbl(query: string): Promise<boolean> {
  try {
    await dns.resolve4(query);
    return true; // resolves → listed
  } catch {
    return false; // NXDOMAIN → not listed
  }
}

function reverseIp(ip: string): string {
  return ip.split(".").reverse().join(".");
}

// ── Check functions ────────────────────────────────────────────────────────────

async function checkSpf(domain: string): Promise<DnsRecordSignal> {
  const records = await resolveTxt(domain);
  const spf = records.find((r) => r.startsWith("v=spf1"));
  return {
    present: !!spf,
    valid: spf ? spf.includes("~all") || spf.includes("-all") : false,
    value: spf ?? null,
  };
}

async function checkDkim(domain: string, selector = "mail"): Promise<DnsRecordSignal> {
  const records = await resolveTxt(`${selector}._domainkey.${domain}`);
  const dkim = records.find((r) => r.includes("v=DKIM1"));
  return {
    present: !!dkim,
    valid: !!dkim,
    value: dkim ?? null,
  };
}

async function checkDmarc(domain: string): Promise<DnsRecordSignal> {
  const records = await resolveTxt(`_dmarc.${domain}`);
  const dmarc = records.find((r) => r.startsWith("v=DMARC1"));
  const hasRejectOrQuarantine = dmarc
    ? dmarc.includes("p=reject") || dmarc.includes("p=quarantine")
    : false;
  return {
    present: !!dmarc,
    valid: hasRejectOrQuarantine,
    value: dmarc ?? null,
  };
}

async function checkIpBlacklists(ip: string): Promise<BlacklistResult[]> {
  const reversed = reverseIp(ip);
  return Promise.all(
    IP_BLACKLISTS.map(async (bl) => ({
      name:       bl.name,
      listed:     await isListedOnDnsbl(`${reversed}.${bl.host}`),
      weight:     bl.weight,
      lookupHost: `${reversed}.${bl.host}`,
    }))
  );
}

async function checkDomainBlacklists(domain: string): Promise<BlacklistResult[]> {
  return Promise.all(
    DOMAIN_BLACKLISTS.map(async (bl) => ({
      name:       bl.name,
      listed:     await isListedOnDnsbl(`${domain}.${bl.host}`),
      weight:     bl.weight,
      lookupHost: `${domain}.${bl.host}`,
    }))
  );
}

// ── Score calculation ──────────────────────────────────────────────────────────
// Budget:
//   DNS records (SPF+DKIM+DMARC):  30 pts  (10 each)
//   Blacklist clean:                40 pts  (deducted per listing)
//   Sending metrics:                30 pts

function calcScore(signals: ReputationSignals): number {
  let score = 0;

  // DNS record checks (30 pts)
  if (signals.spf.present)   score += signals.spf.valid  ? 10 : 5;
  if (signals.dkim.present)  score += signals.dkim.valid ? 10 : 5;
  if (signals.dmarc.present) score += signals.dmarc.valid ? 10 : 5;

  // Blacklist budget (40 pts — start full, deduct per listing)
  const allBlacklists = [...signals.ipBlacklists, ...signals.domainBlacklists];
  const maxBlacklistPenalty = 40;
  let penalty = 0;
  for (const bl of allBlacklists) {
    if (bl.listed) penalty = Math.min(maxBlacklistPenalty, penalty + bl.weight);
  }
  score += maxBlacklistPenalty - penalty;

  // Metrics (30 pts)
  const { bounceRate, complaintRate, openRate, sampleSize } = signals.metrics;
  if (sampleSize >= 10) {
    // Open rate contribution (max 15 pts)
    if (openRate >= 30)      score += 15;
    else if (openRate >= 20) score += 12;
    else if (openRate >= 10) score += 8;
    else if (openRate >= 5)  score += 4;

    // Bounce rate contribution (max 10 pts)
    if (bounceRate <= 1)      score += 10;
    else if (bounceRate <= 2) score += 7;
    else if (bounceRate <= 5) score += 4;

    // Complaint rate contribution (max 5 pts)
    if (complaintRate === 0)       score += 5;
    else if (complaintRate < 0.1)  score += 3;
  } else {
    // No data yet — give neutral 15 pts for metrics
    score += 15;
  }

  return Math.max(0, Math.min(100, score));
}

// ── Main entry point ───────────────────────────────────────────────────────────

export async function runReputationCheck(
  domain: string,
  domainId: string,
  prisma: PrismaClient
): Promise<{ score: number; signals: ReputationSignals; listedOn: string[] }> {
  // Run DNS checks in parallel
  const [spf, dkim, dmarc, mxIp] = await Promise.all([
    checkSpf(domain),
    checkDkim(domain),
    checkDmarc(domain),
    resolveMx(domain),
  ]);

  // Run blacklist checks in parallel (IP + domain)
  const [ipBlacklists, domainBlacklists] = await Promise.all([
    mxIp ? checkIpBlacklists(mxIp) : Promise.resolve([]),
    checkDomainBlacklists(domain),
  ]);

  // Pull recent 30-day metrics from DB
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await prisma.emailEvent.groupBy({
    by: ["type"],
    where: { domainId, occurredAt: { gte: since } },
    _count: { type: true },
  });

  const countMap: Record<string, number> = {};
  for (const e of events) countMap[e.type] = e._count.type;

  const sent      = countMap["SENT"]      ?? 0;
  const opened    = countMap["OPENED"]    ?? 0;
  const bounced   = countMap["BOUNCED"]   ?? 0;
  const complained = countMap["COMPLAINED"] ?? 0;

  const metrics: MetricSignal = {
    sampleSize:    sent,
    openRate:      sent > 0 ? (opened    / sent) * 100 : 0,
    bounceRate:    sent > 0 ? (bounced   / sent) * 100 : 0,
    complaintRate: sent > 0 ? (complained / sent) * 100 : 0,
  };

  const signals: ReputationSignals = { spf, dkim, dmarc, mxIp, ipBlacklists, domainBlacklists, metrics };
  const score    = calcScore(signals);
  const listedOn = [...ipBlacklists, ...domainBlacklists]
    .filter((bl) => bl.listed)
    .map((bl) => bl.name);

  return { score, signals, listedOn };
}
