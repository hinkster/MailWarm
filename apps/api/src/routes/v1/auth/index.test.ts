import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { TEST_JWT_SECRET } from "../../../test-helpers/build-route-app";

// ─── Hoisted prisma mocks (auth routes import prisma directly) ─────────────────
const mockUserFindUnique     = vi.hoisted(() => vi.fn());
const mockUserCreate         = vi.hoisted(() => vi.fn());
const mockUserUpdate         = vi.hoisted(() => vi.fn());
const mockMemberFindFirst    = vi.hoisted(() => vi.fn());
const mockMemberFindMany     = vi.hoisted(() => vi.fn());
const mockMemberUpsert       = vi.hoisted(() => vi.fn());
const mockTransaction        = vi.hoisted(() => vi.fn());
const mockSsoConnFindFirst   = vi.hoisted(() => vi.fn());
const mockGetProfileAndToken = vi.hoisted(() => vi.fn());

vi.mock("@mailwarm/database", () => ({
  prisma: {
    user:          { findUnique: mockUserFindUnique, create: mockUserCreate, update: mockUserUpdate },
    tenantMember:  { findFirst: mockMemberFindFirst, findMany: mockMemberFindMany, upsert: mockMemberUpsert },
    ssoConnection: { findFirst: mockSsoConnFindFirst },
    $transaction:  mockTransaction,
  },
}));

// Mock bcryptjs so tests don't do real hashing
const mockBcryptHash    = vi.hoisted(() => vi.fn().mockResolvedValue("hashed_password"));
const mockBcryptCompare = vi.hoisted(() => vi.fn());
vi.mock("bcryptjs", () => ({ default: { hash: mockBcryptHash, compare: mockBcryptCompare } }));

// Stub WorkOS — use hoisted refs so SSO tests can control return values
vi.mock("@workos-inc/node", () => ({
  WorkOS: vi.fn().mockImplementation(function (this: any) {
    this.sso = {
      getAuthorizationUrl: vi.fn().mockReturnValue("https://sso.example.com/authorize"),
      getProfileAndToken:  mockGetProfileAndToken,
    };
  }),
}));

import { authRoutes } from "./index";

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function buildAuthApp() {
  const app = Fastify({ logger: false });
  await app.register(fastifyJwt, { secret: TEST_JWT_SECRET });
  await app.register(authRoutes);
  await app.ready();
  return app;
}

function makeUser(overrides?: object) {
  return { id: "u-1", email: "user@example.com", name: "Test User", passwordHash: "hashed_password", ...overrides };
}

function makeMembership(overrides?: object) {
  return {
    tenantId: "t-1", userId: "u-1", role: "OWNER", joinedAt: new Date(),
    tenant: { id: "t-1", name: "Test Org", slug: "test-org-abc" },
    ...overrides,
  };
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockUserUpdate.mockResolvedValue({});
  mockMemberUpsert.mockResolvedValue({});
  app = await buildAuthApp();
});

afterEach(() => app.close());

// ─── POST /register ────────────────────────────────────────────────────────────
describe("POST /register", () => {
  beforeEach(() => {
    mockUserFindUnique.mockResolvedValue(null); // no existing user

    mockTransaction.mockImplementation(async (callback: Function) => {
      const tx = {
        user:         { create: vi.fn().mockResolvedValue(makeUser({ email: "new@test.com" })) },
        tenant:       { create: vi.fn().mockResolvedValue({ id: "t-new", name: "New Org", slug: "new-org-abc" }) },
        tenantMember: { create: vi.fn().mockResolvedValue({}) },
        subscription: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(tx);
    });
  });

  it("returns 201 with a JWT token on success", async () => {
    const res = await app.inject({
      method: "POST", url: "/register",
      payload: { email: "new@test.com", password: "password123", name: "New User", orgName: "New Org" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().token).toBeTruthy();
  });

  it("returns user and tenant in the response", async () => {
    const res = await app.inject({
      method: "POST", url: "/register",
      payload: { email: "new@test.com", password: "password123", name: "New User", orgName: "New Org" },
    });
    const body = res.json();
    expect(body.user.email).toBe("new@test.com");
    expect(body.tenant).toBeTruthy();
  });

  it("returns 409 when email is already registered", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser());
    const res = await app.inject({
      method: "POST", url: "/register",
      payload: { email: "user@example.com", password: "password123", name: "User", orgName: "Org" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 400 for an invalid email address", async () => {
    const res = await app.inject({
      method: "POST", url: "/register",
      payload: { email: "not-an-email", password: "password123", name: "User", orgName: "Org" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when password is shorter than 8 characters", async () => {
    const res = await app.inject({
      method: "POST", url: "/register",
      payload: { email: "new@test.com", password: "short", name: "User", orgName: "Org" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("hashes the password before storing", async () => {
    await app.inject({
      method: "POST", url: "/register",
      payload: { email: "new@test.com", password: "password123", name: "User", orgName: "Org" },
    });
    expect(mockBcryptHash).toHaveBeenCalledWith("password123", 12);
  });
});

// ─── POST /login ───────────────────────────────────────────────────────────────
describe("POST /login", () => {
  it("returns 200 with a JWT token for valid credentials", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser());
    mockBcryptCompare.mockResolvedValue(true);
    mockMemberFindFirst.mockResolvedValue(makeMembership());

    const res = await app.inject({
      method: "POST", url: "/login",
      payload: { email: "user@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTruthy();
  });

  it("returns 401 when user does not exist", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST", url: "/login",
      payload: { email: "nobody@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when password is incorrect", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser());
    mockBcryptCompare.mockResolvedValue(false);
    const res = await app.inject({
      method: "POST", url: "/login",
      payload: { email: "user@example.com", password: "wrongpassword" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 for invalid request body", async () => {
    const res = await app.inject({
      method: "POST", url: "/login",
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("includes tenant info when membership exists", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser());
    mockBcryptCompare.mockResolvedValue(true);
    mockMemberFindFirst.mockResolvedValue(makeMembership());

    const body = (await app.inject({
      method: "POST", url: "/login",
      payload: { email: "user@example.com", password: "password123" },
    })).json();

    expect(body.tenant.slug).toBe("test-org-abc");
  });

  it("returns null tenant when user has no membership", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser());
    mockBcryptCompare.mockResolvedValue(true);
    mockMemberFindFirst.mockResolvedValue(null);

    const body = (await app.inject({
      method: "POST", url: "/login",
      payload: { email: "user@example.com", password: "password123" },
    })).json();

    expect(body.tenant).toBeNull();
  });
});

// ─── GET /me ───────────────────────────────────────────────────────────────────
describe("GET /me", () => {
  it("returns 401 without a JWT", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns the current user and tenants for a valid JWT", async () => {
    const token = app.jwt.sign({ sub: "u-1", tenantId: "t-1", email: "user@example.com" });
    mockUserFindUnique.mockResolvedValue(makeUser());
    mockMemberFindMany.mockResolvedValue([makeMembership()]);

    const res = await app.inject({
      method: "GET", url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("user@example.com");
    expect(res.json().tenants).toHaveLength(1);
  });

  it("returns 404 when the JWT sub does not match any user", async () => {
    const token = app.jwt.sign({ sub: "u-ghost", tenantId: "t-1", email: "ghost@example.com" });
    mockUserFindUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET", url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /logout ──────────────────────────────────────────────────────────────
describe("POST /logout", () => {
  it("always returns 200 with success:true (stateless JWT)", async () => {
    const res = await app.inject({ method: "POST", url: "/logout" });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /sso/authorize ────────────────────────────────────────────────────────
describe("GET /sso/authorize", () => {
  beforeEach(() => {
    process.env.WORKOS_API_KEY    = "sk_test_workos";
    process.env.WORKOS_CLIENT_ID  = "client_test_123";
    process.env.NEXT_PUBLIC_API_URL = "https://api.mailwarm.test";
    mockSsoConnFindFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.WORKOS_API_KEY;
    delete process.env.WORKOS_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("redirects to the WorkOS authorization URL", async () => {
    const res = await app.inject({ method: "GET", url: "/sso/authorize?domain=example.com" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://sso.example.com/authorize");
  });

  it("redirects without a domain when neither domain nor tenantSlug is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/sso/authorize" });
    expect(res.statusCode).toBe(302);
  });

  it("looks up the workosOrgId when tenantSlug is supplied", async () => {
    mockSsoConnFindFirst.mockResolvedValue({ workosOrgId: "org-abc", tenantId: "t-1" });
    const res = await app.inject({ method: "GET", url: "/sso/authorize?tenantSlug=acme" });
    expect(res.statusCode).toBe(302);
    expect(mockSsoConnFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenant: { slug: "acme" } }) })
    );
  });

  it("proceeds with no organization when tenantSlug has no active SSO connection", async () => {
    mockSsoConnFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/sso/authorize?tenantSlug=no-sso" });
    expect(res.statusCode).toBe(302);
  });

  it("returns 500 when WORKOS_API_KEY is not configured", async () => {
    delete process.env.WORKOS_API_KEY;
    const res = await app.inject({ method: "GET", url: "/sso/authorize?domain=example.com" });
    // getWorkos() throws — Fastify converts unhandled errors to 500
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /sso/callback ─────────────────────────────────────────────────────────
describe("GET /sso/callback", () => {
  function makeSsoProfile(overrides?: object) {
    return {
      email: "sso@example.com",
      firstName: "SSO",
      lastName: "User",
      organizationId: "org-workos-123",
      id: "wp-profile-1",
      ...overrides,
    };
  }

  function makeSsoConnection(overrides?: object) {
    return { id: "sso-conn-1", tenantId: "t-1", workosOrgId: "org-workos-123", enabled: true, ...overrides };
  }

  beforeEach(() => {
    process.env.WORKOS_API_KEY      = "sk_test_workos";
    process.env.WORKOS_CLIENT_ID    = "client_test_123";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.mailwarm.test";
    mockGetProfileAndToken.mockResolvedValue({ profile: makeSsoProfile() });
    mockSsoConnFindFirst.mockResolvedValue(makeSsoConnection());
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "u-sso", email: "sso@example.com", name: "SSO User" });
  });

  afterEach(() => {
    delete process.env.WORKOS_API_KEY;
    delete process.env.WORKOS_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("returns 400 when code parameter is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/sso/callback" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Missing code");
  });

  it("redirects to the app SSO callback URL on success", async () => {
    const res = await app.inject({ method: "GET", url: "/sso/callback?code=valid-code" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("https://app.mailwarm.test/auth/sso-callback");
    expect(res.headers.location).toContain("token=");
  });

  it("creates a new user when none exists for the SSO email", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await app.inject({ method: "GET", url: "/sso/callback?code=valid-code" });
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "sso@example.com", emailVerified: expect.any(Date) }),
      })
    );
  });

  it("uses the existing user when one already exists for the SSO email", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser({ id: "u-existing", email: "sso@example.com" }));
    await app.inject({ method: "GET", url: "/sso/callback?code=valid-code" });
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("upserts tenant membership when an SSO connection is found", async () => {
    await app.inject({ method: "GET", url: "/sso/callback?code=valid-code" });
    expect(mockMemberUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "t-1", userId: "u-sso" } },
        create: expect.objectContaining({ tenantId: "t-1", role: "MEMBER" }),
      })
    );
  });

  it("skips membership upsert when no SSO connection is found for the org", async () => {
    mockSsoConnFindFirst.mockResolvedValue(null);
    await app.inject({ method: "GET", url: "/sso/callback?code=valid-code" });
    expect(mockMemberUpsert).not.toHaveBeenCalled();
  });

  it("skips membership upsert when the profile has no organizationId", async () => {
    mockGetProfileAndToken.mockResolvedValue({
      profile: makeSsoProfile({ organizationId: undefined }),
    });
    mockSsoConnFindFirst.mockResolvedValue(null); // no org match
    await app.inject({ method: "GET", url: "/sso/callback?code=valid-code" });
    expect(mockMemberUpsert).not.toHaveBeenCalled();
  });

  it("constructs the user name from firstName and lastName", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    mockGetProfileAndToken.mockResolvedValue({
      profile: makeSsoProfile({ firstName: "Jane", lastName: "Doe" }),
    });
    await app.inject({ method: "GET", url: "/sso/callback?code=valid-code" });
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Jane Doe" }) })
    );
  });

  it("handles a profile with no firstName/lastName gracefully", async () => {
    mockGetProfileAndToken.mockResolvedValue({
      profile: makeSsoProfile({ firstName: undefined, lastName: undefined }),
    });
    await app.inject({ method: "GET", url: "/sso/callback?code=valid-code" });
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "" }) })
    );
  });

  it("returns 500 when WorkOS getProfileAndToken throws", async () => {
    mockGetProfileAndToken.mockRejectedValue(new Error("WorkOS error"));
    const res = await app.inject({ method: "GET", url: "/sso/callback?code=bad-code" });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("SSO authentication failed");
  });
});
