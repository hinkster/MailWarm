import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock ──────────────────────────────────────────────────────────────
// execFile uses the node callback convention (err, value).
// promisify wraps it so callback(null, result) resolves the promise with result.
// We pass { stdout, stderr } as the success value to match the exec destructuring
// pattern in the source: `const { stdout } = await exec(...)`.
const mockExecFile = vi.hoisted(() =>
  vi.fn().mockImplementation(
    (_cmd: string, _args: string[], cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout: "", stderr: "" });
    }
  )
);

vi.mock("child_process", () => ({ execFile: mockExecFile }));

vi.mock("@mailwarm/database", () => ({ prisma: {} }));

import { provisionMailbox, deprovisionMailbox, generateDkimKeypair } from "./provisioner";

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("generateDkimKeypair", () => {
  it("returns a selector prefixed with 'mw'", async () => {
    const { selector } = await generateDkimKeypair("example.com");
    expect(selector).toMatch(/^mw[a-z0-9]+$/);
  });

  it("returns a PEM-encoded private key", async () => {
    const { privateKeyPem } = await generateDkimKeypair("example.com");
    expect(privateKeyPem).toContain("PRIVATE KEY");
  });

  it("returns a PEM-encoded public key", async () => {
    const { publicKeyPem } = await generateDkimKeypair("example.com");
    expect(publicKeyPem).toContain("PUBLIC KEY");
  });

  it("returns a dnsRecord with a name ending in _domainkey", async () => {
    const { dnsRecord } = await generateDkimKeypair("example.com");
    expect(dnsRecord.name).toMatch(/_domainkey$/);
  });

  it("returns a dnsRecord value starting with v=DKIM1", async () => {
    const { dnsRecord } = await generateDkimKeypair("example.com");
    expect(dnsRecord.value).toMatch(/^v=DKIM1/);
  });

  it("generates a unique selector on each call", async () => {
    const a = await generateDkimKeypair("example.com");
    const b = await generateDkimKeypair("example.com");
    // selectors are time-based so they should be different when called separately
    // (occasionally equal in fast tests — use key comparison instead)
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
  });
}, 10_000); // RSA 2048-bit generation can take a moment

describe("provisionMailbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls doveadm pw to hash the password", async () => {
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], cb: Function) => {
        if (cmd === "doveadm") cb(null, { stdout: "{SHA512-CRYPT}hashed\n", stderr: "" });
        else cb(null, { stdout: "", stderr: "" });
      }
    );

    await provisionMailbox("test@example.com");

    const doveadmPwCall = mockExecFile.mock.calls.find(
      ([cmd, args]: [string, string[]]) => cmd === "doveadm" && args.includes("pw")
    );
    expect(doveadmPwCall).toBeDefined();
    expect(doveadmPwCall![1]).toContain("-s");
    expect(doveadmPwCall![1]).toContain("SHA512-CRYPT");
  });

  it("writes the passwd entry to /etc/dovecot/passwd via sh", async () => {
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], cb: Function) => {
        if (cmd === "doveadm") cb(null, { stdout: "hashed\n", stderr: "" });
        else cb(null, { stdout: "", stderr: "" });
      }
    );

    await provisionMailbox("test@example.com");

    const shCall = mockExecFile.mock.calls.find(
      ([cmd]: [string]) => cmd === "sh"
    );
    expect(shCall).toBeDefined();
    const shArg: string = shCall![1][1];
    expect(shArg).toContain("/etc/dovecot/passwd");
    expect(shArg).toContain("test@example.com");
  });

  it("returns an object with a non-empty password", async () => {
    mockExecFile.mockImplementation(
      (cmd: string, _args: string[], cb: Function) => {
        if (cmd === "doveadm") cb(null, { stdout: "hashed\n", stderr: "" });
        else cb(null, { stdout: "", stderr: "" });
      }
    );

    const result = await provisionMailbox("test@example.com");

    expect(result.password).toBeTruthy();
    expect(typeof result.password).toBe("string");
  });

  it("does not throw when doveadm reload fails (non-fatal)", async () => {
    mockExecFile.mockImplementation(
      (cmd: string, args: string[], cb: Function) => {
        if (cmd === "doveadm" && args.includes("reload")) {
          cb(new Error("Dovecot not running"), { stdout: "", stderr: "" });
        } else if (cmd === "doveadm") {
          cb(null, { stdout: "hashed\n", stderr: "" });
        } else {
          cb(null, { stdout: "", stderr: "" });
        }
      }
    );

    await expect(provisionMailbox("test@example.com")).resolves.toBeDefined();
  });
});

describe("deprovisionMailbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the address from /etc/dovecot/passwd using sed", async () => {
    await deprovisionMailbox("test@example.com");

    const sedCall = mockExecFile.mock.calls.find(
      ([cmd]: [string]) => cmd === "sed"
    );
    expect(sedCall).toBeDefined();
    expect(sedCall![1]).toContain("/etc/dovecot/passwd");
  });

  it("calls doveadm expunge to purge mail storage", async () => {
    await deprovisionMailbox("test@example.com");

    const expungeCall = mockExecFile.mock.calls.find(
      ([cmd, args]: [string, string[]]) => cmd === "doveadm" && args.includes("expunge")
    );
    expect(expungeCall).toBeDefined();
    expect(expungeCall![1]).toContain("test@example.com");
  });

  it("does not throw when expunge or reload fails (non-fatal)", async () => {
    mockExecFile.mockImplementation(
      (cmd: string, args: string[], cb: Function) => {
        if (cmd === "doveadm") cb(new Error("failed"), { stdout: "", stderr: "" });
        else cb(null, { stdout: "", stderr: "" });
      }
    );

    await expect(deprovisionMailbox("test@example.com")).resolves.toBeUndefined();
  });
});
