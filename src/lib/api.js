const API_BASE = import.meta.env.VITE_API_URL || "";

function getAuthHeaders() {
  const token = document.cookie
    .split("; ")
    .find((c) => c.startsWith("token="))
    ?.split("=")[1];

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: getAuthHeaders(),
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email, password) => request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (data) => request("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  getMe: () => request("/api/auth/me"),

  // Dashboard
  getDashboard: () => request("/api/dashboard"),

  // Carriers / FMCSA
  searchCarriers: (params) => request(`/api/fmcsa/search?${new URLSearchParams(params)}`),
  getCarrier: (dot) => request(`/api/carrier/${dot}`),
  getCarrierProfile: (dot) => request(`/api/fmcsa/carrier/${dot}`),

  // Leads
  getNewDotLeads: (params) => request(`/api/leads/new-ventures?${new URLSearchParams(params)}`),
  getRenewalLeads: (params) => request(`/api/leads/renewals?${new URLSearchParams(params)}`),
  exportLeads: (ids) => request("/api/leads/export", { method: "POST", body: JSON.stringify({ ids }) }),

  // CRM / Pipeline
  getPipeline: () => request("/api/leads/pipeline"),
  updateLeadStage: (id, stage) => request(`/api/leads/${id}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) }),
  addToPipeline: (dot) => request("/api/leads/add", { method: "POST", body: JSON.stringify({ dot }) }),

  // Subscription / Billing
  getSubscription: () => request("/api/subscription"),
  createCheckout: (plan) => request("/api/billing/create-checkout", { method: "POST", body: JSON.stringify({ plan }) }),
  getPortalUrl: () => request("/api/billing/portal"),

  // Admin (owner only)
  getAdminStats: () => request("/api/admin/stats"),
  getAdminUsers: () => request("/api/admin/users"),
  getAdminHealth: () => request("/api/admin/health"),

  // Settings
  updateProfile: (data) => request("/api/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  updateNotifications: (data) => request("/api/auth/notifications", { method: "PUT", body: JSON.stringify(data) }),

  // Contact
  sendContactRequest: (data) => request("/api/contact-request", { method: "POST", body: JSON.stringify(data) }),

  // Reports
  getReports: (params) => request(`/api/reports?${new URLSearchParams(params)}`),
};
