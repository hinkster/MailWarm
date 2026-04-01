import nodemailer from "nodemailer";
import { randomBytes } from "crypto";
import { prisma } from "@mailwarm/database";
import type { Mailbox, SeedMailbox } from "@mailwarm/database";

const transporter = nodemailer.createTransport({
  host: process.env.MTA_HOST,
  port: Number(process.env.MTA_PORT_SUBMISSION ?? 587),
  secure: false, // STARTTLS on 587
  requireTLS: true,
  auth: {
    // Haraka validates against Dovecot virtual account credentials
    user: process.env.MTA_SMTP_USER,
    pass: process.env.MTA_SMTP_PASS,
  },
});

const WARMING_SUBJECTS = [
  "Quick question about your service",
  "Following up on our conversation",
  "Thoughts on this?",
  "Re: Project update",
  "Checking in",
  "A few things I wanted to share",
  "Wanted to reach out",
  "Quick note",
];

const WARMING_BODIES = [
  "Hi,\n\nHope this finds you well. I wanted to reach out and touch base.\n\nLooking forward to hearing from you.\n\nBest,",
  "Hello,\n\nJust following up on my previous message. Let me know if you have any questions.\n\nThanks,",
  "Hi there,\n\nI came across something I thought you might find interesting. Would love to get your thoughts.\n\nBest regards,",
];

export interface SendWarmingEmailParams {
  from: Mailbox;
  to: SeedMailbox;
  scheduleId: string;
  dayLogId: string;
  autoReply: boolean;
  autoOpen: boolean;
  autoClick: boolean;
}

export async function sendWarmingEmail(params: SendWarmingEmailParams) {
  const { from, to, scheduleId, dayLogId } = params;

  const subject = WARMING_SUBJECTS[Math.floor(Math.random() * WARMING_SUBJECTS.length)];
  const body = WARMING_BODIES[Math.floor(Math.random() * WARMING_BODIES.length)];
  const senderName = from.displayName ?? from.address.split("@")[0];
  const senderDomain = from.address.split("@")[1];

  // Pre-generate Message-ID so it can be embedded in the tracking pixel URL
  const messageId = `<${randomBytes(16).toString("hex")}.${Date.now()}@${senderDomain}>`;
  const trackingPixel = `${process.env.API_URL}/v1/track/open?lid=${dayLogId}&mid=${encodeURIComponent(messageId)}`;
  const htmlBody = `
    <html><body>
      <p>${body.replace(/\n/g, "<br/>")}</p>
      <p>${senderName}</p>
      <img src="${trackingPixel}" width="1" height="1" style="display:none" alt="" />
    </body></html>
  `;

  try {
    await transporter.sendMail({
      messageId,
      from: `"${senderName}" <${from.address}>`,
      to: to.address,
      subject,
      text: `${body}\n${senderName}`,
      html: htmlBody,
      headers: {
        "X-Mailwarm-Schedule": scheduleId,
        "X-Mailwarm-DayLog": dayLogId,
        "X-Mailwarm-AutoReply": params.autoReply ? "1" : "0",
      },
    });

    await Promise.all([
      // Record SENT event
      prisma.emailEvent.create({
        data: {
          domainId: from.domainId,
          senderMailboxId: from.id,
          seedMailboxId: to.id,
          messageId,
          type: "SENT",
          subject,
        },
      }),
      // Increment day log
      prisma.warmingDayLog.update({
        where: { id: dayLogId },
        data: { actualSent: { increment: 1 } },
      }),
    ]);
  } catch (err) {
    console.error(`Failed to send warming email from ${from.address} to ${to.address}:`, err);
  }
}
