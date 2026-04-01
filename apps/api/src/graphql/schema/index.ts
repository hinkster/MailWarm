import { makeExecutableSchema } from "@graphql-tools/schema";
import { domainResolvers } from "../resolvers/domain";
import { warmingResolvers } from "../resolvers/warming";
import { analyticsResolvers } from "../resolvers/analytics";

const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

  # ── Queries ─────────────────────────────────────────────────────────────────

  type Query {
    # Domains
    domains: [Domain!]!
    domain(id: ID!): Domain

    # Warming
    warmingSchedules: [WarmingSchedule!]!
    warmingSchedule(id: ID!): WarmingSchedule
    warmingCurvePreview(curve: RampCurve!, target: Int!, days: Int): [DayVolume!]!

    # Analytics
    domainMetrics(domainId: ID!, from: DateTime!, to: DateTime!): DomainMetrics!
    deliverabilityScore(domainId: ID!): Int!
    dmarcReports(domainId: ID!, limit: Int): [DmarcReport!]!

    # Subscription
    subscription: Subscription
  }

  # ── Mutations ────────────────────────────────────────────────────────────────

  type Mutation {
    # Domains
    addDomain(input: AddDomainInput!): Domain!
    removeDomain(id: ID!): Boolean!
    verifyDomain(id: ID!): Domain!

    # DNS
    configureDns(domainId: ID!, input: DnsConfigInput!): DnsConfiguration!
    provisionDnsRecord(domainId: ID!, type: DnsRecordType!): DnsRecord!

    # Warming
    createWarmingSchedule(input: CreateWarmingInput!): WarmingSchedule!
    pauseWarming(scheduleId: ID!): WarmingSchedule!
    resumeWarming(scheduleId: ID!): WarmingSchedule!

    # Mailboxes
    provisionMailbox(domainId: ID!, displayName: String): Mailbox!
    suspendMailbox(id: ID!): Mailbox!
  }

  # ── Types ────────────────────────────────────────────────────────────────────

  enum DomainStatus {
    PENDING_VERIFICATION
    VERIFIED
    WARMING
    WARMED
    PAUSED
    ERROR
  }

  enum WarmingStatus {
    SCHEDULED
    ACTIVE
    PAUSED
    COMPLETED
    FAILED
  }

  enum RampCurve {
    LINEAR
    EXPONENTIAL
    AGGRESSIVE
  }

  enum DnsProvider {
    AZURE
    CLOUDFLARE
    ROUTE53
    MANUAL
  }

  enum DnsRecordType {
    TXT
    MX
    CNAME
  }

  type Domain {
    id: ID!
    name: String!
    status: DomainStatus!
    reputationScore: Int
    verifiedAt: DateTime
    createdAt: DateTime!
    mailboxes: [Mailbox!]!
    dnsConfig: DnsConfiguration
    warmingSchedule: WarmingSchedule
  }

  type Mailbox {
    id: ID!
    address: String!
    displayName: String
    status: String!
    createdAt: DateTime!
  }

  type DnsConfiguration {
    id: ID!
    provider: DnsProvider!
    records: [DnsRecord!]!
  }

  type DnsRecord {
    id: ID!
    type: DnsRecordType!
    name: String!
    value: String!
    ttl: Int!
    status: String!
    verifiedAt: DateTime
  }

  type WarmingSchedule {
    id: ID!
    status: WarmingStatus!
    startDate: DateTime!
    targetDailyVolume: Int!
    currentDay: Int!
    rampCurve: RampCurve!
    autoReply: Boolean!
    autoOpen: Boolean!
    autoClick: Boolean!
    dailyLogs: [WarmingDayLog!]!
  }

  type WarmingDayLog {
    dayNumber: Int!
    date: DateTime!
    targetVolume: Int!
    actualSent: Int!
    delivered: Int!
    opened: Int!
    clicked: Int!
    bounced: Int!
    complained: Int!
    replied: Int!
    inboxRate: Float
  }

  type DayVolume {
    day: Int!
    volume: Int!
  }

  type DomainMetrics {
    sent: Int!
    delivered: Int!
    opened: Int!
    clicked: Int!
    bounced: Int!
    complained: Int!
    openRate: Float!
    clickRate: Float!
    bounceRate: Float!
    inboxPlacementRate: Float
  }

  type DmarcReport {
    id: ID!
    reportingOrg: String!
    dateRangeBegin: DateTime!
    dateRangeEnd: DateTime!
    passCount: Int!
    failCount: Int!
    parsed: JSON!
  }

  type Subscription {
    tier: String!
    status: String!
    currentPeriodEnd: DateTime
  }

  # ── Inputs ───────────────────────────────────────────────────────────────────

  input AddDomainInput {
    name: String!
  }

  input DnsConfigInput {
    provider: DnsProvider!
    zoneId: String!
    credentials: JSON!
  }

  input CreateWarmingInput {
    domainId: ID!
    startDate: DateTime!
    targetDailyVolume: Int!
    rampCurve: RampCurve
    autoReply: Boolean
    autoOpen: Boolean
    autoClick: Boolean
    customCurve: [DayVolumeInput!]
  }

  input DayVolumeInput {
    day: Int!
    volume: Int!
  }
`;

const resolvers = {
  Query: {
    ...domainResolvers.Query,
    ...warmingResolvers.Query,
    ...analyticsResolvers.Query,
  },
  Mutation: {
    ...domainResolvers.Mutation,
    ...warmingResolvers.Mutation,
  },
};

export const schema = makeExecutableSchema({ typeDefs, resolvers });
