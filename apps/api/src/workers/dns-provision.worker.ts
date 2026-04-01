import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@mailwarm/database";
import { getDnsProvider } from "../services/dns";
import { buildAllRecords } from "@mailwarm/shared/src/constants/dns-records";
import type { DnsProvider } from "@mailwarm/database";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const dnsProvisionWorker = new Worker(
  "dns-provision",
  async (job: Job) => {
    if (job.name === "provision-records") await handleProvision(job.data);
    if (job.name === "verify-records")    await handleVerify(job.data);
    if (job.name === "verify-domain")     await handleDomainVerify(job.data);
  },
  { connection, concurrency: 5 }
);

async function handleProvision(data: {
  domainId: string;
  dnsConfigId: string;
  tenantId: string;
  credentials?: Record<string, string>;
  provider: string;
}) {
  const { domainId, dnsConfigId, credentials = {}, provider } = data;

  const [domain, dnsConfig] = await Promise.all([
    prisma.domain.findUnique({ where: { id: domainId } }),
    prisma.dnsConfiguration.findUnique({
      where: { id: dnsConfigId },
      include: { records: true },
    }),
  ]);
  if (!domain || !dnsConfig) return;

  // Find or generate DKIM record from existing DB records
  const existingDkimRecord = dnsConfig.records.find((r) => r.name.includes("_domainkey"));
  const dkimSelector = existingDkimRecord?.name.replace("._domainkey", "") ?? `mw${Date.now().toString(36)}`;
  const dkimPublicKey = existingDkimRecord?.value ?? "";

  const records = buildAllRecords({
    mtaIp: process.env.MTA_PUBLIC_IP!,
    mtaHostname: process.env.MTA_HOSTNAME!,
    domain: domain.name,
    dkimSelector,
    dkimPublicKey,
    dmarcReportEmail: `dmarc-reports+${domain.name}@mailwarm.io`,
    dmarcPolicy: "quarantine",
  });

  if (provider === "MANUAL") {
    // Just upsert the records as PENDING for the user to apply manually
    for (const record of records) {
      await prisma.dnsRecord.upsert({
        where: {
          // Use a composite unique to prevent duplication
          id: dnsConfig.records.find((r) => r.type === record.type && r.name === record.name)?.id ?? "new",
        },
        create: {
          dnsConfigId,
          type: record.type as any,
          name: record.name,
          value: record.value,
          ttl: record.ttl,
          status: "PENDING",
        },
        update: { value: record.value, status: "PENDING" },
      });
    }
    return;
  }

  const dnsProvider = getDnsProvider(provider as DnsProvider, credentials);

  for (const record of records) {
    const existingRecord = dnsConfig.records.find((r) => r.type === record.type && r.name === record.name);

    try {
      const providerRecordId = await dnsProvider.createRecord(dnsConfig.zoneId!, {
        name: record.name,
        type: record.type as any,
        value: record.value,
        ttl: record.ttl,
      });

      await prisma.dnsRecord.upsert({
        where: { id: existingRecord?.id ?? "new" },
        create: {
          dnsConfigId,
          type: record.type as any,
          name: record.name,
          value: record.value,
          ttl: record.ttl,
          status: "PROVISIONED",
          providerRecordId,
        },
        update: { status: "PROVISIONED", providerRecordId, value: record.value },
      });
    } catch (err) {
      console.error(`Failed to create DNS record ${record.type} ${record.name}:`, err);
      if (existingRecord) {
        await prisma.dnsRecord.update({
          where: { id: existingRecord.id },
          data: { status: "FAILED" },
        });
      }
    }
  }

  // Schedule verification check in 60 seconds
  await import("../queues").then(({ DnsProvisionQueue }) =>
    DnsProvisionQueue.add("verify-records", { domainId, dnsConfigId }, { delay: 60_000 })
  );
}

async function handleVerify(data: { domainId: string; dnsConfigId: string }) {
  const { domainId, dnsConfigId } = data;

  const dnsConfig = await prisma.dnsConfiguration.findUnique({
    where: { id: dnsConfigId },
    include: { records: true },
  });
  if (!dnsConfig || dnsConfig.provider === "MANUAL") return;

  let allVerified = true;
  const dnsProvider = getDnsProvider(dnsConfig.provider, {}); // credentials loaded from KV in prod

  for (const record of dnsConfig.records) {
    const verified = await dnsProvider.verifyRecord(dnsConfig.zoneId!, {
      name: record.name,
      type: record.type as any,
      value: record.value,
      ttl: record.ttl,
    });

    await prisma.dnsRecord.update({
      where: { id: record.id },
      data: {
        status: verified ? "VERIFIED" : "PROVISIONED",
        verifiedAt: verified ? new Date() : null,
      },
    });

    if (!verified) allVerified = false;
  }

  if (allVerified) {
    await prisma.domain.update({
      where: { id: domainId },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });
  }
}

async function handleDomainVerify(data: { domainId: string }) {
  // Check TXT verification token in DNS
  const domain = await prisma.domain.findUnique({ where: { id: data.domainId } });
  if (!domain) return;

  // In production: query DNS for TXT record mailwarm-verify=<token>
  // Stub for MVP — auto-verify after a short delay in dev
  if (process.env.NODE_ENV !== "production") {
    await prisma.domain.update({
      where: { id: data.domainId },
      data: { status: "VERIFIED", verifiedAt: new Date() },
    });
  }
}
