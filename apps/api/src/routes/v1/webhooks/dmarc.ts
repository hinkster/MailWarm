import type { FastifyPluginAsync } from "fastify";
import { DmarcIngestQueue } from "../../../queues";

export const dmarcInboundRoute: FastifyPluginAsync = async (app) => {
  // POST /v1/webhooks/dmarc — receives DMARC aggregate reports forwarded from MX
  // The DMARC ruf/rua mailto points here via a forwarding alias.
  //
  // Auth: when DMARC_INBOUND_SECRET is set, callers must supply the same value
  // in the X-Dmarc-Secret header.  The check is skipped in dev when the env var
  // is absent, so existing local setups continue to work without configuration.
  app.post("/dmarc", async (request, reply) => {
    const secret = process.env.DMARC_INBOUND_SECRET;
    if (secret) {
      const provided = (request.headers["x-dmarc-secret"] as string | undefined) ?? "";
      if (provided !== secret) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    }

    const body = request.body as {
      tenantId?: string;
      domain?: string;
      xmlReport?: string;
      rawEmail?: string;
    };

    if (!body.xmlReport && !body.rawEmail) {
      return reply.code(400).send({ error: "Missing report payload" });
    }

    await DmarcIngestQueue.add("ingest", {
      tenantId: body.tenantId,
      domain: body.domain,
      xmlReport: body.xmlReport,
      rawEmail: body.rawEmail,
    });

    return reply.send({ received: true });
  });
};
