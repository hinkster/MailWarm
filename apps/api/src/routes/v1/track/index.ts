import type { FastifyPluginAsync } from "fastify";

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export const trackingRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/track/open?lid=<dayLogId>&mid=<messageId>
  app.get("/open", async (request, reply) => {
    const { lid, mid } = request.query as { lid?: string; mid?: string };

    if (lid) {
      await app.prisma.warmingDayLog.update({
        where: { id: lid },
        data: { opened: { increment: 1 } },
      }).catch(() => {});
    }

    if (mid) {
      const event = await app.prisma.emailEvent.findFirst({ where: { messageId: mid } });
      if (event) {
        await app.prisma.emailEvent.create({
          data: {
            domainId: event.domainId,
            senderMailboxId: event.senderMailboxId,
            messageId: mid,
            type: "OPENED",
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
          },
        }).catch(() => {});
      }
    }

    return reply
      .header("Content-Type", "image/gif")
      .header("Cache-Control", "no-store, no-cache, must-revalidate")
      .header("Pragma", "no-cache")
      .send(TRACKING_PIXEL);
  });

  // GET /v1/track/click?lid=<dayLogId>&url=<destination>
  app.get("/click", async (request, reply) => {
    const { lid, url } = request.query as { lid?: string; url?: string };

    if (lid) {
      await app.prisma.warmingDayLog.update({
        where: { id: lid },
        data: { clicked: { increment: 1 } },
      }).catch(() => {});
    }

    if (!url) return reply.code(400).send({ error: "Missing url" });

    // Validate URL to prevent open redirect
    try {
      const dest = new URL(url);
      if (!["http:", "https:"].includes(dest.protocol)) throw new Error("Invalid protocol");
      return reply.redirect(dest.toString());
    } catch {
      return reply.code(400).send({ error: "Invalid redirect URL" });
    }
  });
};
