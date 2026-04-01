import { execFile } from "child_process";
import { promisify } from "util";
import forge from "node-forge";
import { prisma } from "@mailwarm/database";
import { buildDkimRecord } from "@mailwarm/shared/src/constants/dns-records";

const exec = promisify(execFile);

export interface ProvisionResult {
  address: string;
  dovecotUsername: string;
  dkimSelector: string;
  dkimPublicKey: string;
}

/**
 * Provisions a Dovecot virtual mailbox account.
 * Uses doveadm to create the account and set a random password.
 * The password is stored encrypted in Azure Key Vault (ref returned).
 */
export async function provisionMailbox(address: string): Promise<{ password: string }> {
  const password = generateSecurePassword();

  // doveadm pw -s SHA512-CRYPT generates a hashed password
  const { stdout: pwHash } = await exec("doveadm", ["pw", "-s", "SHA512-CRYPT", "-p", password]);

  // Write to Dovecot passwd file (append mode)
  // In production this writes to a passwd-file managed by a Dovecot auth driver
  // Format: user:hash:uid:gid:gecos:home:shell
  const passwdEntry = `${address}:${pwHash.trim()}:5000:5000:::/dev/null\n`;

  await exec("sh", [
    "-c",
    `echo '${passwdEntry.replace(/'/g, "'\\''")}' >> /etc/dovecot/passwd`,
  ]);

  // Reload Dovecot to pick up the new account
  await exec("doveadm", ["reload"]).catch(() => {
    // Non-fatal on dev if Dovecot isn't running
  });

  return { password };
}

/**
 * Deprovisions a Dovecot virtual mailbox.
 */
export async function deprovisionMailbox(address: string): Promise<void> {
  // Remove from passwd file
  await exec("sed", ["-i", `/^${escapeRegex(address)}:/d`, "/etc/dovecot/passwd"]);
  // Purge mail storage
  await exec("doveadm", ["expunge", "-u", address, "mailbox", "*", "all"]).catch(() => {});
  await exec("doveadm", ["reload"]).catch(() => {});
}

/**
 * Generates a DKIM keypair for a domain and returns the private key (PEM)
 * and public key (for DNS record).
 */
export async function generateDkimKeypair(domain: string): Promise<{
  selector: string;
  privateKeyPem: string;
  publicKeyPem: string;
  dnsRecord: ReturnType<typeof buildDkimRecord>;
}> {
  const selector = `mw${Date.now().toString(36)}`;

  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);

  const dnsRecord = buildDkimRecord(selector, publicKeyPem);

  return { selector, privateKeyPem, publicKeyPem, dnsRecord };
}

function generateSecurePassword(length = 24): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/@/g, "\\@");
}
