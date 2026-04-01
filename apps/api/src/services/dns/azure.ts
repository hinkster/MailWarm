import { DnsManagementClient } from "@azure/arm-dns";
import { ClientSecretCredential } from "@azure/identity";
import type { IDnsProvider, DnsRecord } from "./index";

export class AzureDnsProvider implements IDnsProvider {
  private client: DnsManagementClient;
  private resourceGroup: string;

  constructor(credentials: Record<string, string>) {
    const cred = new ClientSecretCredential(
      credentials.tenantId,
      credentials.clientId,
      credentials.clientSecret
    );
    this.client = new DnsManagementClient(cred, credentials.subscriptionId);
    this.resourceGroup = credentials.resourceGroup;
  }

  async createRecord(zone: string, record: DnsRecord): Promise<string> {
    const recordName = record.name === "@" ? "@" : record.name;

    if (record.type === "TXT") {
      await this.client.recordSets.createOrUpdate(
        this.resourceGroup, zone, recordName, "TXT",
        { tTL: record.ttl, txtRecords: [{ value: [record.value] }] }
      );
    } else if (record.type === "MX") {
      const [preference, exchange] = record.value.split(" ");
      await this.client.recordSets.createOrUpdate(
        this.resourceGroup, zone, recordName, "MX",
        { tTL: record.ttl, mxRecords: [{ preference: parseInt(preference), exchange }] }
      );
    } else if (record.type === "CNAME") {
      await this.client.recordSets.createOrUpdate(
        this.resourceGroup, zone, recordName, "CNAME",
        { tTL: record.ttl, cnameRecord: { cname: record.value } }
      );
    }

    return `${zone}/${record.type}/${recordName}`;
  }

  async deleteRecord(zone: string, recordId: string): Promise<void> {
    const [, type, name] = recordId.split("/");
    await this.client.recordSets.delete(this.resourceGroup, zone, name, type as any);
  }

  async verifyRecord(zone: string, record: DnsRecord): Promise<boolean> {
    try {
      const result = await this.client.recordSets.get(
        this.resourceGroup, zone, record.name === "@" ? "@" : record.name, record.type as any
      );
      return !!result;
    } catch {
      return false;
    }
  }
}
