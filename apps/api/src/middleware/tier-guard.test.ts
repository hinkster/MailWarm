import { describe, it, expect } from "vitest";
import { requireTier, requireMinTier } from "./tier-guard";

// Minimal Fastify-shaped fakes — just the fields our middleware touches
function makeRequest(tier: string | null | undefined) {
  return {
    tenantCtx:
      tier === null
        ? undefined
        : { subscription: tier === undefined ? undefined : { tier } },
  } as any;
}

function makeReply() {
  const r = {
    _code: 0 as number,
    _body: null as any,
    code(n: number) {
      this._code = n;
      return this;
    },
    send(b: any) {
      this._body = b;
      return this;
    },
  };
  return r;
}

describe("requireTier", () => {
  it("returns 401 when tenantCtx is missing", async () => {
    const reply = makeReply();
    await requireTier("sso")({ tenantCtx: undefined } as any, reply as any);
    expect(reply._code).toBe(401);
  });

  it("returns 403 when STARTER requests an SSO-gated feature", async () => {
    const reply = makeReply();
    await requireTier("sso")(makeRequest("STARTER"), reply as any);
    expect(reply._code).toBe(403);
    expect(reply._body.error).toBe("feature_not_available");
    expect(reply._body.currentTier).toBe("STARTER");
    expect(reply._body.requiredFeature).toBe("sso");
  });

  it("passes when PRO accesses an SSO-gated feature", async () => {
    const reply = makeReply();
    await requireTier("sso")(makeRequest("PRO"), reply as any);
    expect(reply._code).toBe(0); // reply.code() was never called
  });

  it("passes when ENTERPRISE accesses an SSO-gated feature", async () => {
    const reply = makeReply();
    await requireTier("sso")(makeRequest("ENTERPRISE"), reply as any);
    expect(reply._code).toBe(0);
  });

  it("returns 403 when STARTER requests webhooks (boolean false)", async () => {
    const reply = makeReply();
    await requireTier("webhooks")(makeRequest("STARTER"), reply as any);
    expect(reply._code).toBe(403);
  });

  it("passes when GROWTH requests webhooks (boolean true)", async () => {
    const reply = makeReply();
    await requireTier("webhooks")(makeRequest("GROWTH"), reply as any);
    expect(reply._code).toBe(0);
  });

  it("returns 403 when STARTER requests maxWebhooks (numeric 0)", async () => {
    const reply = makeReply();
    await requireTier("maxWebhooks")(makeRequest("STARTER"), reply as any);
    expect(reply._code).toBe(403);
  });

  it("passes when GROWTH requests maxWebhooks (numeric > 0)", async () => {
    const reply = makeReply();
    await requireTier("maxWebhooks")(makeRequest("GROWTH"), reply as any);
    expect(reply._code).toBe(0);
  });

  it("defaults to STARTER when subscription is absent", async () => {
    // tenantCtx exists but has no subscription property
    const req = { tenantCtx: {} } as any;
    const reply = makeReply();
    await requireTier("sso")(req, reply as any);
    expect(reply._code).toBe(403);
  });
});

describe("requireMinTier", () => {
  it("returns 401 when tenantCtx is missing", async () => {
    const reply = makeReply();
    await requireMinTier("PRO")({ tenantCtx: undefined } as any, reply as any);
    expect(reply._code).toBe(401);
  });

  it("returns 403 when STARTER tries a PRO endpoint", async () => {
    const reply = makeReply();
    await requireMinTier("PRO")(makeRequest("STARTER"), reply as any);
    expect(reply._code).toBe(403);
    expect(reply._body.error).toBe("tier_upgrade_required");
    expect(reply._body.minimumTier).toBe("PRO");
    expect(reply._body.currentTier).toBe("STARTER");
  });

  it("returns 403 when GROWTH tries a PRO endpoint", async () => {
    const reply = makeReply();
    await requireMinTier("PRO")(makeRequest("GROWTH"), reply as any);
    expect(reply._code).toBe(403);
  });

  it("passes when PRO accesses a PRO endpoint (exact match)", async () => {
    const reply = makeReply();
    await requireMinTier("PRO")(makeRequest("PRO"), reply as any);
    expect(reply._code).toBe(0);
  });

  it("passes when ENTERPRISE accesses a PRO endpoint (higher tier)", async () => {
    const reply = makeReply();
    await requireMinTier("PRO")(makeRequest("ENTERPRISE"), reply as any);
    expect(reply._code).toBe(0);
  });

  it("passes when STARTER accesses a STARTER endpoint", async () => {
    const reply = makeReply();
    await requireMinTier("STARTER")(makeRequest("STARTER"), reply as any);
    expect(reply._code).toBe(0);
  });

  it("returns 403 when STARTER tries an ENTERPRISE endpoint", async () => {
    const reply = makeReply();
    await requireMinTier("ENTERPRISE")(makeRequest("STARTER"), reply as any);
    expect(reply._code).toBe(403);
  });

  it("returns 403 when PRO tries an ENTERPRISE endpoint", async () => {
    const reply = makeReply();
    await requireMinTier("ENTERPRISE")(makeRequest("PRO"), reply as any);
    expect(reply._code).toBe(403);
  });
});
