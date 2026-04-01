import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@mailwarm/database";
import { extractXmlFromEmail, parseDmarcXml } from "../lib/dmarc";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const dmarcIngestWorker = new Worker(
  "dmarc-ingest",
  async (job: Job) => {
    const { tenantId, domain, xmlReport, rawEmail } = job.data;

    // Resolve raw XML — prefer explicit xmlReport, otherwise extract from MIME email
    let xml: string | null = xmlReport ?? null;
    if (!xml && rawEmail) {
      xml = extractXmlFromEmail(rawEmail);
    }
    if (!xml) return;

    const result = await parseDmarcXml(xml);
    if (!result) return;

    const { feedback, analysis } = result;
    const reportMeta = (feedback as any).report_metadata;
    const policyPub  = (feedback as any).policy_published;
    const reportDomain: string = policyPub?.domain ?? domain;

    // Resolve tenantId from domain when not supplied in the job payload
    let resolvedTenantId: string | undefined = tenantId;
    if (!resolvedTenantId && reportDomain) {
      const domainRecord = await prisma.domain.findFirst({
        where: { name: reportDomain },
        select: { tenantId: true },
      });
      resolvedTenantId = domainRecord?.tenantId;
    }
    if (!resolvedTenantId) return;

    const parsedPayload = { ...feedback, _analysis: analysis };

    await prisma.dmarcReport.upsert({
      where: {
        tenantId_reportId: {
          tenantId: resolvedTenantId,
          reportId: reportMeta?.report_id ?? `${Date.now()}`,
        },
      },
      create: {
        tenantId: resolvedTenantId,
        domain: reportDomain,
        reportingOrg: reportMeta?.org_name ?? "unknown",
        reportId: reportMeta?.report_id ?? `${Date.now()}`,
        dateRangeBegin: new Date(parseInt(reportMeta?.date_range?.begin ?? "0", 10) * 1000),
        dateRangeEnd:   new Date(parseInt(reportMeta?.date_range?.end   ?? "0", 10) * 1000),
        rawXml: xml,
        parsed: parsedPayload,
        passCount: analysis.passCount,
        failCount: analysis.failCount,
      },
      update: {
        parsed: parsedPayload,
        passCount: analysis.passCount,
        failCount: analysis.failCount,
      },
    });
  },
  { connection, concurrency: 3 }
);
