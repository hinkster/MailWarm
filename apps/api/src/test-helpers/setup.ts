import { afterEach } from "vitest";

// Ensure env is always in test mode
process.env.NODE_ENV = "test";

// Reset any env vars that tests may have mutated between tests.
// Individual test files are responsible for setting them in beforeEach
// and cleaning up in afterEach — this is a safety net for ad-hoc mutations.
const RESET_ENV_KEYS = [
  "DMARC_INBOUND_SECRET",
];

const originalEnv: Record<string, string | undefined> = {};
for (const key of RESET_ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

afterEach(() => {
  for (const key of RESET_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});
