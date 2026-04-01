import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@mailwarm/database";
import { provisionMailbox, deprovisionMailbox, generateDkimKeypair } from "../services/mailbox/provisioner";
import { DnsProvisionQueue } from "../queues";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const mailboxProvisionWorker = new Worker(
  "mailbox-provision",
  async (job: Job) => {
    if (job.name === "provision")    await handleProvision(job.data);
    if (job.name === "deprovision") await handleDeprovision(job.data);
  },
  { connection, concurrency: 3 }
);

async function handleProvision(data: {
  mailboxId: string;
  address: string;
  domainId: string;
  tenantId: string;
}) {
  const { mailboxId, address, domainId } = data;

  try {
    // 1. Provision Dovecot account
    await provisionMailbox(address);

    // 2. Check if domain already has a DKIM keypair; if not, generate one
    const existingDkim = await prisma.dnsConfiguration.findUnique({
      where: { domainId },
      include: { records: { where: { type: "TXT", name: { contains: "_domainkey" } } } },
    });

    const dkimSelector = existingDkim?.records[0]?.name?.replace("._domainkey", "") ?? null;

    let selector = dkimSelector;
    if (!selector) {
      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (domain) {
        const keypair = await generateDkimKeypair(domain.name);
        selector = keypair.selector;

        // Store DKIM record in DB (will be applied when DNS provider is connected)
        let dnsConfig = await prisma.dnsConfiguration.findUnique({ where: { domainId } });
        if (!dnsConfig) {
          dnsConfig = await prisma.dnsConfiguration.create({
            data: { domainId, provider: "MANUAL" },
          });
        }

        await prisma.dnsRecord.create({
          data: {
            dnsConfigId: dnsConfig.id,
            type: "TXT",
            name: keypair.dnsRecord.name,
            value: keypair.dnsRecord.value,
            ttl: keypair.dnsRecord.ttl,
            status: "PENDING",
          },
        });

        // Store the private key so Haraka can retrieve it for DKIM signing
        await prisma.dnsConfiguration.update({
          where: { id: dnsConfig.id },
          data: { dkimPrivateKey: keypair.privateKeyPem },
        });

        // Queue DNS provisioning if provider is configured
        if (dnsConfig.provider !== "MANUAL") {
          await DnsProvisionQueue.add("provision-records", { domainId, dnsConfigId: dnsConfig.id });
        }
      }
    }

    // 3. Mark mailbox as active
    await prisma.mailbox.update({
      where: { id: mailboxId },
      data: { status: "ACTIVE", dkimSelector: selector },
    });
  } catch (err) {
    await prisma.mailbox.update({
      where: { id: mailboxId },
      data: { status: "SUSPENDED" },
    });
    throw err;
  }
}

async function handleDeprovision(data: { mailboxId: string; address: string }) {
  await deprovisionMailbox(data.address);
  await prisma.mailbox.update({
    where: { id: data.mailboxId },
    data: { status: "DELETED" },
  });
}
