import { Queue } from "bullmq";
import { Redis } from "ioredis";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const WarmingDispatchQueue = new Queue("warming-dispatch", { connection });
export const DnsProvisionQueue    = new Queue("dns-provision",    { connection });
export const MailboxProvisionQueue = new Queue("mailbox-provision", { connection });
export const MetricsRollupQueue   = new Queue("metrics-rollup",  { connection });
export const DmarcIngestQueue     = new Queue("dmarc-ingest",    { connection });
export const BounceProcessorQueue = new Queue("bounce-processor", { connection });
export const WebhookDeliveryQueue  = new Queue("webhook-delivery",  { connection });
export const ReputationCheckQueue  = new Queue("reputation-check",  { connection });
export const ImapPollQueue         = new Queue("imap-reply",         { connection });
