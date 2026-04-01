import type { DnsProvider } from "@mailwarm/database";
import { AzureDnsProvider } from "./azure";
import { CloudflareDnsProvider } from "./cloudflare";
import { Route53DnsProvider } from "./route53";

export interface DnsRecord {
  name: string;
  type: "TXT" | "MX" | "CNAME";
  value: string;
  ttl: number;
}

export interface IDnsProvider {
  createRecord(zone: string, record: DnsRecord): Promise<string>; // returns provider record ID
  deleteRecord(zone: string, recordId: string): Promise<void>;
  verifyRecord(zone: string, record: DnsRecord): Promise<boolean>;
}

export function getDnsProvider(provider: DnsProvider, credentials: Record<string, string>): IDnsProvider {
  switch (provider) {
    case "AZURE":
      return new AzureDnsProvider(credentials);
    case "CLOUDFLARE":
      return new CloudflareDnsProvider(credentials);
    case "ROUTE53":
      return new Route53DnsProvider(credentials);
    case "MANUAL":
    default:
      throw new Error("Manual DNS provider does not support automated record creation.");
  }
}
