const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body?.error ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function createApiClient(token: string) {
  const get  = <T>(path: string) => request<T>(path, { method: "GET", token });
  const post  = <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", token, body: body ? JSON.stringify(body) : undefined });
  const patch = <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", token, body: body ? JSON.stringify(body) : undefined });
  const del   = <T>(path: string) => request<T>(path, { method: "DELETE", token });

  return {
    // Auth
    me: () => get<any>("/v1/auth/me"),

    // Domains
    domains: {
      list: () => get<any>("/v1/domains"),
      get:  (id: string) => get<any>(`/v1/domains/${id}`),
      create: (name: string) => post<any>("/v1/domains", { name }),
      delete: (id: string) => del<void>(`/v1/domains/${id}`),
      verify: (id: string) => post<any>(`/v1/domains/${id}/verify`),
    },

    // Mailboxes
    mailboxes: {
      list: (domainId?: string) => get<any>(`/v1/mailboxes${domainId ? `?domainId=${domainId}` : ""}`),
      create: (domainId: string, displayName?: string) =>
        post<any>("/v1/mailboxes", { domainId, displayName }),
      delete: (id: string) => del<void>(`/v1/mailboxes/${id}`),
    },

    // Warming
    warming: {
      schedules: () => get<any>("/v1/warming/schedules"),
      preview: (curve: string, target: number, days: number) =>
        get<any>(`/v1/warming/schedules/preview?curve=${curve}&target=${target}&days=${days}`),
      create: (data: any) => post<any>("/v1/warming/schedules", data),
      pause: (id: string) => patch<any>(`/v1/warming/schedules/${id}/pause`),
      resume: (id: string) => patch<any>(`/v1/warming/schedules/${id}/resume`),
    },

    // Analytics
    analytics: {
      metrics: (params: { from: string; to: string; domainId?: string }) =>
        get<any>(`/v1/analytics/metrics?from=${params.from}&to=${params.to}${params.domainId ? `&domainId=${params.domainId}` : ""}`),
      timeseries: (params: { from: string; to: string; domainId?: string }) =>
        get<any>(`/v1/analytics/timeseries?from=${params.from}&to=${params.to}${params.domainId ? `&domainId=${params.domainId}` : ""}`),
      domains: () => get<any>("/v1/analytics/domains"),
      dmarc: (domainName?: string) => get<any>(`/v1/analytics/dmarc${domainName ? `?domainName=${domainName}` : ""}`),
    },

    // DNS
    dns: {
      get: (domainId: string) => get<any>(`/v1/dns/${domainId}`),
      preview: (domainId: string) => get<any>(`/v1/dns/${domainId}/preview`),
      connect: (data: any) => post<any>("/v1/dns/connect", data),
      verify: (domainId: string) => post<any>(`/v1/dns/${domainId}/verify`),
    },

    // Billing
    billing: {
      subscription: () => get<any>("/v1/billing/subscription"),
      checkout: (tier: string) => post<any>("/v1/billing/checkout", { tier }),
      portal: () => post<any>("/v1/billing/portal"),
    },

    // API Keys
    apiKeys: {
      list: () => get<any>("/v1/api-keys"),
      create: (name: string, scopes?: string[]) => post<any>("/v1/api-keys", { name, scopes }),
      revoke: (id: string) => del<void>(`/v1/api-keys/${id}`),
    },

    // Webhooks
    webhooks: {
      list: () => get<any>("/v1/webhooks/endpoints"),
      create: (url: string, events: string[]) => post<any>("/v1/webhooks/endpoints", { url, events }),
      delete: (id: string) => del<void>(`/v1/webhooks/endpoints/${id}`),
      deliveries: (webhookId: string) => get<any>(`/v1/webhooks/endpoints/${webhookId}/deliveries`),
    },

    // Reputation
    reputation: {
      get:   (domainId: string) => get<any>(`/v1/reputation/${domainId}`),
      check: (domainId: string) => post<any>(`/v1/reputation/${domainId}/check`, {}),
    },

    // Team
    team: {
      list: () => get<any>("/v1/team"),
      invite: (email: string, role?: string) => post<any>("/v1/team/invite", { email, role }),
      updateRole: (memberId: string, role: string) => patch<any>(`/v1/team/${memberId}`, { role }),
      remove: (memberId: string) => del<void>(`/v1/team/${memberId}`),
    },
  };
}
