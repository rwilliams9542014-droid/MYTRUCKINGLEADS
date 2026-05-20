// API utility functions with error handling

const IS_LOCAL_DEV =
  window.location.protocol === "file:" ||
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const API_BASE =
  globalThis.MY_TRUCKING_LEADS_API_BASE ||
  document.documentElement.dataset.apiBase ||
  (IS_LOCAL_DEV
    ? "http://localhost:4000/api"
    : `${window.location.origin}/api`);

class APIError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
    this.name = "APIError";
  }
}

export async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem("authToken");
  const timeoutMs = options.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      credentials: "include"
    });
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new APIError(
        data?.error || `HTTP ${response.status}`,
        response.status
      );
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("API Error:", err);
    if (err instanceof APIError) throw err;
    throw new APIError(err.name === "AbortError" ? "Request timed out" : err.message || "Network error");
  }
}

export async function signup(email, password, name, plan = "basic") {
  if (!email || !password || !name) {
    throw new APIError("Missing required fields", 400);
  }

  const data = await apiCall("/auth/signup", {
    method: "POST",
    body: { email, password, name, plan }
  });

  if (data.token) {
    localStorage.setItem("authToken", data.token);
  }
  if (data.user) localStorage.setItem("user", JSON.stringify(data.user));

  return data;
}

export async function login(email, password) {
  if (!email || !password) {
    throw new APIError("Email and password required", 400);
  }

  const data = await apiCall("/auth/login", {
    method: "POST",
    body: { email, password }
  });

  if (data.token) {
    localStorage.setItem("authToken", data.token);
  }
  if (data.user) localStorage.setItem("user", JSON.stringify(data.user));

  return data;
}

export function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("user");
}

export function isAuthenticated() {
  return !!(localStorage.getItem("authToken") || localStorage.getItem("user"));
}

export function getCurrentUser() {
  const user = localStorage.getItem("user");
  if (!user) return null;

  try {
    return JSON.parse(user);
  } catch {
    localStorage.removeItem("user");
    return null;
  }
}

export async function refreshCurrentUser() {
  const data = await apiCall("/auth/me");
  if (data.user) {
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user;
  }
  return null;
}

function normalizeCarrierResult(carrier = {}) {
  const dot = String(carrier.dot || carrier.dotNumber || "").trim();
  const mc = String(carrier.mc || carrier.docketNumber || "").trim();
  const carrierName = carrier.carrierName || carrier.legalName || carrier.name || "Unknown Carrier";

  return {
    ...carrier,
    dot,
    dotNumber: carrier.dotNumber || dot,
    mc,
    docketNumber: carrier.docketNumber || mc,
    carrierName,
    legalName: carrier.legalName || carrierName,
    phone: carrier.phone || carrier.phoneNumber || "",
    address: carrier.address || carrier.physicalAddress || "",
    cargo: carrier.cargo || carrier.cargoHauled || carrier.cargo_hauled || "",
    liveUnavailable: Boolean(carrier.liveUnavailable),
    message: String(carrier.message || "").trim()
  };
}

export async function searchCarrier(dot, mc, name) {
  if (!dot && !mc && !name) {
    throw new APIError("DOT, MC, or carrier name required", 400);
  }

  const data = dot && !mc && !name
    ? await apiCall(`/carriers/${encodeURIComponent(dot)}`, { timeout: 75000 })
    : await apiCall(
      mc
        ? `/carriers/search?mc=${encodeURIComponent(mc)}&limit=1`
        : `/carriers/search?name=${encodeURIComponent(name)}&limit=1`,
      { timeout: 75000 }
    );

  if (data.carrier) return normalizeCarrierResult(data.carrier);
  if (Array.isArray(data.results) && data.results.length > 0) return normalizeCarrierResult(data.results[0]);
  if (Array.isArray(data) && data.length > 0) return normalizeCarrierResult(data[0]);
  return normalizeCarrierResult(data);
}

export async function getCarrierProfile(dot) {
  if (!dot) {
    throw new APIError("DOT number required", 400);
  }

  const data = await apiCall(`/carriers/${encodeURIComponent(dot)}`, { timeout: 75000 });
  return normalizeCarrierResult(data.carrier || data);
}

export async function getMySubscription() {
  return apiCall("/subscription/me");
}

export async function cancelSubscription() {
  return apiCall("/billing/cancel", {
    method: "POST"
  });
}

export async function createLead(leadData) {
  if (!leadData.carrier_name) {
    throw new APIError("Missing required lead fields", 400);
  }

  return apiCall("/leads", {
    method: "POST",
    body: leadData
  });
}

export async function getLeads() {
  return apiCall("/leads");
}

export async function updateLead(leadId, updates) {
  return apiCall(`/leads/${leadId}`, {
    method: "PUT",
    body: updates
  });
}

export async function deleteLead(leadId) {
  return apiCall(`/leads/${leadId}`, {
    method: "DELETE"
  });
}

export async function createCheckoutSession(plan) {
  const user = getCurrentUser();
  if (!user) {
    throw new APIError("User not authenticated", 401);
  }

  return apiCall("/billing/checkout", {
    method: "POST",
    body: {
      plan,
      userId: user.id,
      email: user.email
    }
  });
}

export async function getExpiringInsurance() {
  return apiCall("/leads/renewals");
}

export async function getActiveInsurance() {
  return apiCall("/insurance/active");
}

export async function searchProspectLeads(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  return apiCall(`/leads/renewals?${params.toString()}`);
}

export async function exportProspectLeads(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  const token = localStorage.getItem("authToken");
  const response = await fetch(`${API_BASE}/carrier/prospects/export?${params.toString()}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new APIError(data?.error || `HTTP ${response.status}`, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `trucking-prospect-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function searchNewVentureLeads(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  return apiCall(`/leads/new?${params.toString()}`);
}

export async function exportNewVentureLeads(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  const token = localStorage.getItem("authToken");
  const response = await fetch(`${API_BASE}/carrier/new-ventures/export?${params.toString()}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new APIError(data?.error || `HTTP ${response.status}`, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `new-venture-trucking-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function claimExportQuota({ exportType, recordCount }) {
  const data = await apiCall("/carrier/exports/claim", {
    method: "POST",
    body: {
      exportType,
      recordCount
    }
  });

  const user = getCurrentUser();
  if (user && data?.access) {
    user.monthlyExportRows = data.access.monthlyExportsUsed;
    user.monthlyExportLimit = data.access.monthlyExportLimit;
    user.monthlyExportsRemaining = data.access.monthlyExportRemaining;
    localStorage.setItem("user", JSON.stringify(user));
  }

  return data;
}
