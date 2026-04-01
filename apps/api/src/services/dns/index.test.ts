import { describe, it, expect, vi } from "vitest";

vi.mock("./cloudflare", () => ({
  CloudflareDnsProvider: vi.fn().mockImplementation(function (creds: any) {
    (this as any)._creds = creds;
  }),
}));

vi.mock("./route53", () => ({
  Route53DnsProvider: vi.fn().mockImplementation(function (creds: any) {
    (this as any)._creds = creds;
  }),
}));

vi.mock("./azure", () => ({
  AzureDnsProvider: vi.fn().mockImplementation(function (creds: any) {
    (this as any)._creds = creds;
  }),
}));

import { getDnsProvider } from "./index";
import { CloudflareDnsProvider } from "./cloudflare";
import { Route53DnsProvider } from "./route53";
import { AzureDnsProvider } from "./azure";

describe("getDnsProvider factory", () => {
  it("returns a CloudflareDnsProvider for CLOUDFLARE", () => {
    const p = getDnsProvider("CLOUDFLARE" as any, { apiToken: "tok" });
    expect(p).toBeInstanceOf(CloudflareDnsProvider);
  });

  it("returns a Route53DnsProvider for ROUTE53", () => {
    const p = getDnsProvider("ROUTE53" as any, { accessKeyId: "k", secretAccessKey: "s" });
    expect(p).toBeInstanceOf(Route53DnsProvider);
  });

  it("returns an AzureDnsProvider for AZURE", () => {
    const p = getDnsProvider("AZURE" as any, { tenantId: "t", clientId: "c", clientSecret: "s", subscriptionId: "sub", resourceGroup: "rg" });
    expect(p).toBeInstanceOf(AzureDnsProvider);
  });

  it("throws for MANUAL", () => {
    expect(() => getDnsProvider("MANUAL" as any, {})).toThrow("Manual DNS provider does not support automated record creation.");
  });

  it("throws for an unknown provider string", () => {
    expect(() => getDnsProvider("UNKNOWN" as any, {})).toThrow();
  });
});
