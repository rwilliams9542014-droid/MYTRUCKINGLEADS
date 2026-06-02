const configuredBase =
  import.meta.env.DEV
    ? (import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      window.MY_TRUCKING_LEADS_API_BASE ||
      "")
    : "";

export const API_BASE = String(configuredBase).replace(/\/$/, "");

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  return text || null;
}

function errorMessage(status, data) {
  if (data?.error) return data.error;
  if (data?.message) return data.message;
  if (status === 400) return "Please check the form and try again.";
  if (status === 401) return "Invalid email or password.";
  if (status === 403) return "You do not have access to that page.";
  if (status >= 500) return "The server had a problem. Please try again in a moment.";
  return `Request failed with status ${status}.`;
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body != null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error("Network error. Please check your connection and try again.");
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    const err = new Error(errorMessage(response.status, data));
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function requestWithFallback(primaryPath, fallbackPath, options) {
  try {
    return await apiRequest(primaryPath, options);
  } catch (err) {
    if (err.status === 404 && fallbackPath) {
      return apiRequest(fallbackPath, options);
    }
    throw err;
  }
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  });
  return search.toString();
}

export const api = {
  login: (payload) => apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  register: (payload) => requestWithFallback("/api/auth/signup", "/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  getMe: () => apiRequest("/api/auth/me"),

  getDashboard: () => apiRequest("/api/dashboard/producer-summary"),
  getDashboardSummary: () => apiRequest("/api/dashboard/producer-summary"),

  searchCarriers: (params) => {
    const search = queryString(params);
    return apiRequest(`/api/carriers${search ? `?${search}` : ""}`);
  },
  searchCarrierIntelligence: (params) => {
    const search = queryString(params);
    return apiRequest(`/api/carriers/search${search ? `?${search}` : ""}`);
  },
  searchFmcsaCarrier: (params) => {
    const search = queryString(params);
    return apiRequest(`/api/fmcsa/carrier-search${search ? `?${search}` : ""}`);
  },
  getCarrier: (dot) => apiRequest(`/api/carriers/${encodeURIComponent(dot)}`),
  getCarrierProfile: (dot) => apiRequest(`/api/carriers/${encodeURIComponent(dot)}`),
  getCarrierInsurance: (dot) => apiRequest(`/api/carriers/${encodeURIComponent(dot)}/insurance`),
  getCarrierSafety: (dot) => apiRequest(`/api/carriers/${encodeURIComponent(dot)}/safety`),
  enrichSelectedCarriers: (dotNumbers, mode = "new") => apiRequest("/api/carriers/enrich-selected", {
    method: "POST",
    body: JSON.stringify({ dotNumbers, mode }),
  }),

  getNewDotLeads: (params) => {
    const search = queryString(params);
    return apiRequest(`/api/leads/new${search ? `?${search}` : ""}`);
  },
  getRenewalLeads: (params) => {
    const search = queryString(params);
    return apiRequest(`/api/leads/renewals${search ? `?${search}` : ""}`);
  },
  getLeads: () => apiRequest("/api/leads"),
  updateLead: (id, updates) => apiRequest(`/api/leads/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  }),
  deleteLead: (id) => apiRequest(`/api/leads/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }),
  addLead: (payload) => apiRequest("/api/leads", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  addToPipeline: (dot) => apiRequest("/api/leads", {
    method: "POST",
    body: JSON.stringify({ dot }),
  }),

  getSubscription: () => apiRequest("/api/subscription/me"),
  createCheckout: (plan) => apiRequest("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  }),

  getAdminStats: () => apiRequest("/api/admin/overview"),
  getAdminOverview: () => apiRequest("/api/admin/overview"),
  getAdminUsers: () => apiRequest("/api/admin/users"),
  getAdminHealth: () => apiRequest("/api/admin/webhook-health"),
  getFmcsaDiagnostics: (dot) => apiRequest(`/api/admin/fmcsa-diagnostics/${encodeURIComponent(dot)}`),

  updateProfile: (data) => apiRequest("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  updatePassword: (data) => requestWithFallback("/api/auth/password", "/api/auth/change-password", {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  updateNotifications: (data) => apiRequest("/api/auth/notifications", {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  sendContactRequest: (data) => apiRequest("/api/contact-request", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  submitQuoteRequest: (data) => apiRequest("/api/marketplace/quote-requests", {
    method: "POST",
    body: data instanceof FormData ? data : JSON.stringify(data),
  }),

  getMarketplaceLeads: (params) => apiRequest(`/api/marketplace/leads?${queryString(params)}`),
  purchaseMarketplaceLead: (id) => apiRequest(`/api/marketplace/leads/${encodeURIComponent(id)}/purchase`, {
    method: "POST",
  }),

  getReports: (params) => apiRequest(`/api/reports/summary?${queryString(params)}`),

  getOutreachTemplates: () => apiRequest("/api/outreach/templates"),
  getOutreachUsage: () => apiRequest("/api/outreach/usage"),
  getOutreachLogs: (params) => {
    const search = queryString(params);
    return apiRequest(`/api/outreach/logs${search ? `?${search}` : ""}`);
  },
  previewOutreach: (payload) => apiRequest("/api/outreach/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  sendOutreachEmail: (payload) => apiRequest("/api/outreach/email/send", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  sendOutreachSms: (payload) => apiRequest("/api/outreach/sms/send", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  sendBulkOutreachEmail: (payload) => apiRequest("/api/outreach/email/send-bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  sendBulkOutreachSms: (payload) => apiRequest("/api/outreach/sms/send-bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  optOutContact: (payload) => apiRequest("/api/outreach/opt-out", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
};
