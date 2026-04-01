/**
 * DNS record templates for SPF, DKIM, and DMARC.
 * Values with {{placeholders}} are replaced at generation time.
 */

export interface DnsRecordTemplate {
  name: string;
  type: "TXT" | "MX" | "CNAME";
  value: string;
  ttl: number;
  description: string;
}

/** Generate SPF record for a given domain using our MTA IP */
export function buildSpfRecord(mtaIp: string, domain: string): DnsRecordTemplate {
  return {
    name: "@",
    type: "TXT",
    value: `v=spf1 ip4:${mtaIp} include:${domain} ~all`,
    ttl: 300,
    description: "SPF record authorising MailWarm MTA to send on your behalf",
  };
}

/** Generate DKIM TXT record */
export function buildDkimRecord(
  selector: string,
  publicKeyPem: string
): DnsRecordTemplate {
  // Strip PEM headers/footers and newlines for DNS TXT value
  const keyBody = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\n/g, "");

  return {
    name: `${selector}._domainkey`,
    type: "TXT",
    value: `v=DKIM1; k=rsa; p=${keyBody}`,
    ttl: 300,
    description: `DKIM public key for selector "${selector}"`,
  };
}

/** Generate DMARC record */
export function buildDmarcRecord(
  domain: string,
  policy: "none" | "quarantine" | "reject" = "quarantine",
  reportEmail?: string
): DnsRecordTemplate {
  let value = `v=DMARC1; p=${policy}; sp=${policy}; adkim=s; aspf=s; pct=100`;

  if (reportEmail) {
    value += `; rua=mailto:${reportEmail}; ruf=mailto:${reportEmail}`;
  }

  return {
    name: "_dmarc",
    type: "TXT",
    value,
    ttl: 300,
    description: `DMARC policy (${policy}) — aggregate reports sent to MailWarm`,
  };
}

/** MX record pointing to our inbound MTA for auto-reply */
export function buildMxRecord(mtaHostname: string): DnsRecordTemplate {
  return {
    name: "@",
    type: "MX",
    value: `10 ${mtaHostname}`,
    ttl: 300,
    description: "MX record routing inbound mail through MailWarm for warming replies",
  };
}

/** Returns all required records for a full domain setup */
export function buildAllRecords(params: {
  mtaIp: string;
  mtaHostname: string;
  domain: string;
  dkimSelector: string;
  dkimPublicKey: string;
  dmarcReportEmail: string;
  dmarcPolicy?: "none" | "quarantine" | "reject";
}): DnsRecordTemplate[] {
  return [
    buildSpfRecord(params.mtaIp, params.domain),
    buildDkimRecord(params.dkimSelector, params.dkimPublicKey),
    buildDmarcRecord(params.domain, params.dmarcPolicy ?? "quarantine", params.dmarcReportEmail),
    buildMxRecord(params.mtaHostname),
  ];
}
