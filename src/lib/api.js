const configuredBase =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  window.MY_TRUCKING_LEADS_API_BASE ||
  "";

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
  if (data?.message) return data.message;
  if (data?.error) return data.error;
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
  register: (payload) => requestWithFallback("/api/auth/register", "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  getMe: () => apiRequest("/api/auth/me"),

  getDashboard: () => apiRequest("/api/dashboard"),

  searchCarriers: (params) => {
    const search = queryString(params);
    return apiRequest(`/api/carrier/search${search ? `?${search}` : ""}`);
  },
  searchFmcsaCarrier: (params) => {
    const search = queryString(params);
    return apiRequest(`/api/fmcsa/carrier-search${search ? `?${search}` : ""}`);
  },
  getCarrier: (dot) => apiRequest(`/api/carrier/${dot}`),
  getCarrierProfile: (dot) => apiRequest(`/api/carrier/${dot}`),

  getNewDotLeads: (params) => apiRequest(`/api/leads/new?${queryString(params)}`),
  getRenewalLeads: (params) => apiRequest(`/api/leads/renewals?${queryString(params)}`),
  exportLeads: (ids) => apiRequest("/api/leads/export", {
    method: "POST",
    body: JSON.stringify({ ids }),
  }),

  getPipeline: () => apiRequest("/api/leads/pipeline"),
  updateLeadStage: (id, stage) => apiRequest(`/api/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  }),
  addToPipeline: (dot) => apiRequest("/api/leads/add", {
    method: "POST",
    body: JSON.stringify({ dot }),
  }),

  getSubscription: () => apiRequest("/api/subscription"),
  createCheckout: (plan) => apiRequest("/api/billing/create-checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  }),
  getPortalUrl: () => apiRequest("/api/billing/portal"),

  getAdminStats: () => apiRequest("/api/admin/stats"),
  getAdminUsers: () => apiRequest("/api/admin/users"),
  getAdminHealth: () => apiRequest("/api/admin/health"),

  updateProfile: (data) => apiRequest("/api/auth/profile", {
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
    body: JSON.stringify(data),
  }),

  getReports: (params) => apiRequest(`/api/reports?${queryString(params)}`),
};
