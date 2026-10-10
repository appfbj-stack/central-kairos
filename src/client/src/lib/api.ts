// API client — todas as chamadas ao backend passam por aqui.
// Em dev, o Vite proxy redireciona /api → http://localhost:3013.
// Em prod, o Express serve o front e a API no mesmo host.

const BASE = "/api";

export type InstallationStatus = "TRIAL" | "ACTIVE" | "BLOCKED" | "EXPIRED" | "ARCHIVED";
export type Plan = "FREE" | "BASIC" | "PRO" | "ULTRA" | "ENTERPRISE";

export const PLAN_LIMITS: Record<Plan, number> = {
  FREE: 15,
  BASIC: 100,
  PRO: 200,
  ULTRA: 300,
  ENTERPRISE: 999999,
};

export interface Installation {
  id: string;
  productName: string;
  clientName: string;
  companyName: string | null;
  appUrl: string;
  dbIdentifier: string | null;
  status: InstallationStatus;
  trialStartAt: string | null;
  trialEndsAt: string | null;
  registeredAt: string;
  notes: string | null;
  plan: Plan;
  usageLimit: number;
  usageUsed: number;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstallationHistory {
  id: string;
  installationId: string;
  fromStatus: InstallationStatus | null;
  toStatus: InstallationStatus;
  reason: string | null;
  changedBy: string;
  createdAt: string;
}

function getToken(): string | null {
  return localStorage.getItem("central_token");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  // Auth
  async login(email: string, password: string) {
    const data = await request<{ token: string; user: { id: string; email: string; name: string } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    );
    localStorage.setItem("central_token", data.token);
    localStorage.setItem("central_user", JSON.stringify(data.user));
    return data;
  },
  async me() {
    return request<{ user: { userId: string; email: string; name: string } }>("/auth/me");
  },
  async logout() {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch {}
    localStorage.removeItem("central_token");
    localStorage.removeItem("central_user");
  },
  getUser(): { id: string; email: string; name: string } | null {
    const raw = localStorage.getItem("central_user");
    return raw ? JSON.parse(raw) : null;
  },
  isAuthed(): boolean {
    return !!getToken();
  },

  // Installations
  async listInstallations(params: { status?: string; product?: string; search?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.product) qs.set("product", params.product);
    if (params.search) qs.set("search", params.search);
    const q = qs.toString();
    return request<{
      installations: Installation[];
      total: number;
      byStatus: Record<string, number>;
    }>(`/installations${q ? `?${q}` : ""}`);
  },
  async getInstallation(id: string) {
    return request<{ installation: Installation & { history: InstallationHistory[] } }>(
      `/installations/${id}`
    );
  },
  async createInstallation(data: Partial<Installation>) {
    return request<{ installation: Installation }>("/installations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInstallation(id: string, data: Partial<Installation> & { reason?: string }) {
    return request<{ installation: Installation }>(`/installations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async blockInstallation(id: string, reason?: string) {
    return request<{ installation: Installation }>(`/installations/${id}/block`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  async unblockInstallation(id: string, reason?: string) {
    return request<{ installation: Installation }>(`/installations/${id}/unblock`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  async changePlan(id: string, plan: Plan, periodDays: number = 30) {
    return request<{ installation: Installation }>(`/installations/${id}/plan`, {
      method: "POST",
      body: JSON.stringify({ plan, periodDays }),
    });
  },
  async resetUsage(id: string) {
    return request<{ installation: Installation }>(`/installations/${id}/usage/reset`, {
      method: "POST",
    });
  },
  async listPlans() {
    return request<{ plans: { id: Plan; name: Plan; messagesPerMonth: number }[] }>(
      `/installations/plans/list`
    );
  },

  // Public status (no auth) — for future use
  async publicStatus(id: string) {
    const res = await fetch(BASE + `/public/installation/${id}/status`);
    return res.json();
  },
};