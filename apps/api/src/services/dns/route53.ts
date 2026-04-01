import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import type { IDnsProvider, DnsRecord } from "./index";

export class Route53DnsProvider implements IDnsProvider {
  private client: Route53Client;

  constructor(credentials: Record<string, string>) {
    this.client = new Route53Client({
      region: "us-east-1",
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
  }

  async createRecord(zone: string, record: DnsRecord): Promise<string> {
    await this.client.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone,
      ChangeBatch: {
        Changes: [{
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: record.name,
            Type: record.type,
            TTL: record.ttl,
            ResourceRecords: [{ Value: record.type === "TXT" ? `"${record.value}"` : record.value }],
          },
        }],
      },
    }));
    return `${zone}/${record.type}/${record.name}`;
  }

  async deleteRecord(zone: string, recordId: string): Promise<void> {
    const [hostedZoneId, type, name] = recordId.split("/");
    await this.client.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [{
          Action: "DELETE",
          ResourceRecordSet: { Name: name, Type: type as any, TTL: 300, ResourceRecords: [] },
        }],
      },
    }));
  }

  async verifyRecord(zone: string, record: DnsRecord): Promise<boolean> {
    const result = await this.client.send(new ListResourceRecordSetsCommand({
      HostedZoneId: zone,
      StartRecordName: record.name,
      StartRecordType: record.type as any,
      MaxItems: 1,
    }));
    return (result.ResourceRecordSets?.length ?? 0) > 0;
  }
}
