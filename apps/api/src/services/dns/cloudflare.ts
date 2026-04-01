import type { IDnsProvider, DnsRecord } from "./index";

export class CloudflareDnsProvider implements IDnsProvider {
  private apiToken: string;
  private baseUrl = "https://api.cloudflare.com/client/v4";

  constructor(credentials: Record<string, string>) {
    this.apiToken = credentials.apiToken;
  }

  private async request(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as any;
    if (!data.success) throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
    return data.result;
  }

  async createRecord(zone: string, record: DnsRecord): Promise<string> {
    const result = await this.request("POST", `/zones/${zone}/dns_records`, {
      type: record.type,
      name: record.name,
      content: record.value,
      ttl: record.ttl,
    });
    return result.id;
  }

  async deleteRecord(zone: string, recordId: string): Promise<void> {
    await this.request("DELETE", `/zones/${zone}/dns_records/${recordId}`);
  }

  async verifyRecord(zone: string, record: DnsRecord): Promise<boolean> {
    const results = await this.request(
      "GET",
      `/zones/${zone}/dns_records?type=${record.type}&name=${record.name}`
    );
    return Array.isArray(results) && results.length > 0;
  }
}
