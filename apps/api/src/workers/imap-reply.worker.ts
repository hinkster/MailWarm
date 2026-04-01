import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { ImapFlow } from "imapflow";
import { prisma } from "@mailwarm/database";
import { ImapPollQueue } from "../queues";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const imapReplyWorker = new Worker(
  "imap-reply",
  async (_job: Job) => { await pollAllMailboxes(); },
  { connection, concurrency: 1 }
);

async function pollAllMailboxes() {
  const masterUser = process.env.DOVECOT_MASTER_USER;
  const masterPass = process.env.DOVECOT_MASTER_PASS;

  if (!masterUser || !masterPass) {
    console.warn("[imap-reply] DOVECOT_MASTER_USER/PASS not set — skipping poll");
    return;
  }

  const mailboxes = await prisma.mailbox.findMany({
    where: {
      role: "CUSTOMER",
      status: "ACTIVE",
      domain: { warmingSchedule: { status: "ACTIVE" } },
    },
  });

  for (const mailbox of mailboxes) {
    try {
      await pollMailbox(mailbox.dovecotUsername, mailbox.domainId, masterUser, masterPass);
    } catch (err) {
      console.error(`[imap-reply] Failed to poll ${mailbox.dovecotUsername}:`, err);
    }
  }
}

export async function pollMailbox(
  dovecotUsername: string,
  domainId: string,
  masterUser: string,
  masterPass: string,
): Promise<number> {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? "localhost",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: {
      // Dovecot master-user auth: <mailbox>*<masterUser>
      user: `${dovecotUsername}*${masterUser}`,
      pass: masterPass,
    },
    logger: false,
  });

  await client.connect();
  let repliesRecorded = 0;

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const unseenUids = await client.search({ seen: false }, { uid: true });
      if (!unseenUids.length) return 0;

      for await (const msg of client.fetch(
        unseenUids,
        { envelope: true },
        { uid: true },
      )) {
        const inReplyTo = normalizeMessageId(msg.envelope.inReplyTo);
        if (!inReplyTo) {
          // Not a reply — mark seen and skip
          await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
          continue;
        }

        const recorded = await recordReply(domainId, inReplyTo);
        if (recorded) repliesRecorded++;

        await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return repliesRecorded;
}

/**
 * Looks up the original SENT event by messageId, then records a REPLIED event
 * and increments today's WarmingDayLog.replied counter.
 * Returns true if a new reply event was created.
 */
export async function recordReply(domainId: string, inReplyTo: string): Promise<boolean> {
  // Find the original SENT event
  const sentEvent = await prisma.emailEvent.findFirst({
    where: { messageId: inReplyTo, type: "SENT", domainId },
  });
  if (!sentEvent) return false;

  // Deduplicate — don't record a second REPLIED for the same messageId
  const existing = await prisma.emailEvent.findFirst({
    where: { messageId: inReplyTo, type: "REPLIED", domainId },
  });
  if (existing) return false;

  // Find today's WarmingDayLog for this domain's active schedule
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayLog = await prisma.warmingDayLog.findFirst({
    where: {
      date: today,
      schedule: { domainId, status: "ACTIVE" },
    },
  });

  await prisma.$transaction([
    prisma.emailEvent.create({
      data: {
        domainId,
        senderMailboxId: sentEvent.senderMailboxId,
        seedMailboxId: sentEvent.seedMailboxId,
        messageId: inReplyTo,
        type: "REPLIED",
      },
    }),
    ...(dayLog
      ? [prisma.warmingDayLog.update({
          where: { id: dayLog.id },
          data: { replied: { increment: 1 } },
        })]
      : []),
  ]);

  return true;
}

/** Strips angle brackets from a Message-ID value, e.g. <abc@domain> → abc@domain */
function normalizeMessageId(raw: string | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.trim().replace(/^<|>$/g, "");
  return stripped || null;
}

// Register repeatable poll job on worker boot — every 10 minutes
ImapPollQueue.add("poll", {}, { repeat: { pattern: "*/10 * * * *" } });
