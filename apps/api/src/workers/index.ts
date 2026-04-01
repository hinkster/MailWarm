/**
 * Worker bootstrap — imported by the standalone worker process.
 * All workers register themselves when imported.
 */
import { warmingDispatchWorker }  from "./warming-dispatch.worker";
import { mailboxProvisionWorker } from "./mailbox-provision.worker";
import { dnsProvisionWorker }     from "./dns-provision.worker";
import { dmarcIngestWorker }      from "./dmarc-ingest.worker";
import { metricsRollupWorker }    from "./metrics-rollup.worker";
import { bounceProcessorWorker }  from "./bounce-processor.worker";
import { webhookDeliveryWorker }   from "./webhook-delivery.worker";
import { reputationCheckWorker }  from "./reputation-check.worker";
import { imapReplyWorker }         from "./imap-reply.worker";

const workers = [
  warmingDispatchWorker,
  mailboxProvisionWorker,
  dnsProvisionWorker,
  dmarcIngestWorker,
  metricsRollupWorker,
  bounceProcessorWorker,
  webhookDeliveryWorker,
  reputationCheckWorker,
  imapReplyWorker,
];

console.log(`[workers] Started ${workers.length} workers`);

process.on("SIGTERM", async () => {
  console.log("[workers] SIGTERM received — draining...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
