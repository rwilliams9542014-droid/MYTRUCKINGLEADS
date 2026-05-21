(function () {
  const API_BASE =
    window.MY_TRUCKING_LEADS_API_BASE ||
    document.documentElement.dataset.apiBase ||
    `${window.location.origin}/api`;

  const state = {
    user: null,
    access: null,
    leads: [],
    notifications: [],
    activeLead: null,
    filters: {
      tier: "",
      state: "",
      status: ""
    }
  };

  function byId(id) {
    return document.getElementById(id);
  }

  async function api(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      ...options,
      body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  function fmtMoney(value) {
    return `$${Number(value || 0).toFixed(2)}`;
  }

  function fmtDate(value) {
    if (!value) return "Not provided";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function fmtDateTime(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  function setMessage(type, text) {
    const element = byId("marketplaceMessage");
    if (!element) return;
    element.hidden = false;
    element.className = `message-card message-${type}`;
    element.textContent = text;
  }

  function clearMessage() {
    const element = byId("marketplaceMessage");
    if (!element) return;
    element.hidden = true;
    element.textContent = "";
  }

  function tierClass(tier) {
    return `tier-${String(tier || "").toLowerCase()}`;
  }

  function renderSignalGrid(signals = []) {
    if (!signals.length) {
      return `<p class="muted-copy">Qualification signals are still being prepared for this lead.</p>`;
    }

    return `
      <div class="detail-list">
        ${signals.map((signal) => `
          <div>
            <span>Qualification Signal</span>
            <strong>${signal}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderHeader() {
    if (byId("headerUser") && state.user) {
      const plan = state.access?.marketplacePlanLabel || "Starter";
      byId("headerUser").textContent = `${state.user.name || state.user.email} • ${plan}`;
    }

    if (byId("accessPlan")) {
      byId("accessPlan").textContent = state.access?.marketplacePlanLabel || "Starter";
    }
    if (byId("accessCredits")) {
      const remaining = state.access?.freeLeadCreditsRemaining ?? 0;
      const included = state.access?.freeLeadCreditsPerMonth ?? 0;
      byId("accessCredits").textContent = included ? `${remaining} of ${included} free leads left` : "No monthly credits";
    }
    if (byId("accessPriority")) {
      byId("accessPriority").textContent = state.access?.priorityNotifications ? "Priority alerts enabled" : "Standard marketplace access";
    }
  }

  function renderStats() {
    const total = state.leads.length;
    const gold = state.leads.filter((lead) => lead.leadTier === "Gold").length;
    const purchased = state.leads.filter((lead) => !lead.masked).length;
    const avgScore = total
      ? Math.round(state.leads.reduce((sum, lead) => sum + Number(lead.leadScore || 0), 0) / total)
      : 0;

    byId("statTotal").textContent = total;
    byId("statGold").textContent = gold;
    byId("statOwned").textContent = purchased;
    byId("statScore").textContent = avgScore;
  }

  function renderNotifications() {
    const container = byId("notificationList");
    if (!container) return;

    if (!state.notifications.length) {
      container.innerHTML = `<div class="empty-note">No marketplace notifications yet.</div>`;
      return;
    }

    container.innerHTML = state.notifications.map((notification) => `
      <button type="button" class="notification-item${notification.read_at ? "" : " unread"}" data-notification-id="${notification.id}">
        <strong>${notification.title}</strong>
        <span>${notification.message}</span>
        <small>${fmtDateTime(notification.created_at)}</small>
      </button>
    `).join("");

    container.querySelectorAll("[data-notification-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const notificationId = button.getAttribute("data-notification-id");
        try {
          await api(`/marketplace/notifications/${notificationId}/read`, { method: "POST" });
          const item = state.notifications.find((notification) => String(notification.id) === String(notificationId));
          if (item) item.read_at = new Date().toISOString();
          renderNotifications();
        } catch (error) {
          setMessage("error", error.message);
        }
      });
    });
  }

  function renderLeads() {
    const grid = byId("leadGrid");
    if (!grid) return;

    if (!state.leads.length) {
      grid.innerHTML = `<div class="empty-panel">No leads matched your filters. Try another tier or state.</div>`;
      return;
    }

    grid.innerHTML = state.leads.map((lead) => `
      <article class="lead-card ${tierClass(lead.leadTier)}">
        <div class="lead-card-top">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <span class="tier-chip ${tierClass(lead.leadTier)}">${lead.leadTier} Lead</span>
            <span class="price-pill">${lead.qualificationBadge || "Quote Ready"}</span>
          </div>
          <span class="price-pill">${fmtMoney(lead.price)}</span>
        </div>
        <h3>${lead.masked ? "Carrier identity locked until purchase" : lead.companyName}</h3>
        <div class="lead-score">Lead Score <strong>${lead.leadScore}</strong></div>
        <div class="lead-metrics">
          <div><span>Fleet</span><strong>${lead.fleetSize} Trucks</strong></div>
          <div><span>State</span><strong>${lead.state || "Multi-state"}</strong></div>
          <div><span>Cargo</span><strong>${lead.cargoType || "Not listed"}</strong></div>
          <div><span>Renewal</span><strong>${lead.renewalProximityDays != null ? `${lead.renewalProximityDays} Days` : "Unknown"}</strong></div>
          <div><span>Docs</span><strong>${lead.requiredDocumentsSubmitted}/${lead.requiredDocumentsTotal}</strong></div>
          <div><span>Status</span><strong>${lead.status}</strong></div>
        </div>
        <p class="lead-note">${lead.qualificationExplanation || ""}</p>
        <p class="muted-copy">${lead.masked ? lead.revealMessage : "This lead has been unlocked in your workspace and CRM."}</p>
        <div class="lead-actions">
          <button type="button" class="ghost-button" data-view-lead="${lead.id}">${lead.masked ? "Preview Lead" : "Open Lead"}</button>
          ${lead.masked
            ? `<button type="button" class="primary-button" data-buy-lead="${lead.id}">Buy Lead</button>`
            : `<button type="button" class="primary-button" data-view-lead="${lead.id}">View Documents</button>`}
        </div>
      </article>
    `).join("");

    grid.querySelectorAll("[data-view-lead]").forEach((button) => {
      button.addEventListener("click", () => viewLead(button.getAttribute("data-view-lead")));
    });
    grid.querySelectorAll("[data-buy-lead]").forEach((button) => {
      button.addEventListener("click", () => buyLead(button.getAttribute("data-buy-lead")));
    });
  }

  function renderLeadDetail() {
    const panel = byId("leadDetail");
    if (!panel) return;

    if (!state.activeLead) {
      panel.innerHTML = `
        <div class="detail-empty">
          <h3>Select a marketplace lead</h3>
          <p>Preview a card to see coverage details, pricing, and document readiness.</p>
        </div>
      `;
      return;
    }

    const lead = state.activeLead;
    panel.innerHTML = `
      <div class="detail-head">
        <div>
          <span class="tier-chip ${tierClass(lead.leadTier)}">${lead.leadTier} Lead</span>
          <h3>${lead.masked ? "Lead details are partially hidden" : lead.companyName}</h3>
          <p>${lead.masked ? lead.revealMessage : "Full carrier, contact, and document details are unlocked for this purchase."}</p>
        </div>
        <div class="detail-price">${fmtMoney(lead.price)}</div>
      </div>
      <div class="detail-grid">
        <div><span>Lead Score</span><strong>${lead.leadScore}</strong></div>
        <div><span>Renewal Date</span><strong>${fmtDate(lead.renewalDate)}</strong></div>
        <div><span>Fleet Size</span><strong>${lead.fleetSize} trucks</strong></div>
        <div><span>Coverage</span><strong>${lead.coverageNeeded || "Not provided"}</strong></div>
      </div>
      <div class="detail-section">
        <h4>${lead.qualificationBadge || `${lead.leadTier} Qualification`}</h4>
        <p class="lead-note">${lead.qualificationExplanation || "This lead was scored using documentation strength, urgency, and contact readiness."}</p>
        ${renderSignalGrid(lead.qualificationSignals || [])}
      </div>
      <div class="detail-section">
        <h4>Contact & Carrier</h4>
        ${lead.masked ? `
          <div class="locked-panel">
            <strong>Locked until purchase</strong>
            <p>Company name, contact details, DOT, MC, and document access unlock after purchase.</p>
            <button type="button" class="primary-button" data-buy-lead="${lead.id}">Buy Lead</button>
          </div>
        ` : `
          <div class="detail-list">
            <div><span>Company</span><strong>${lead.companyName || "Not provided"}</strong></div>
            <div><span>Contact</span><strong>${lead.contactName || "Not provided"}</strong></div>
            <div><span>Title</span><strong>${lead.contactTitle || "Not provided"}</strong></div>
            <div><span>Phone</span><strong>${lead.phoneNumber || "Not provided"}</strong></div>
            <div><span>Email</span><strong>${lead.emailAddress || "Not provided"}</strong></div>
            <div><span>DOT / MC</span><strong>${lead.dotNumber || "N/A"} / ${lead.mcNumber || "N/A"}</strong></div>
            <div><span>States Operated</span><strong>${lead.statesOperated || lead.state || "Not provided"}</strong></div>
            <div><span>Current Insurance</span><strong>${lead.currentInsuranceCompany || "Not provided"}</strong></div>
          </div>
        `}
      </div>
      <div class="detail-section">
        <h4>Documents</h4>
        ${lead.masked ? `
          <p class="muted-copy">Document access becomes available after purchase.</p>
        ` : lead.documents && lead.documents.length ? `
          <div class="document-downloads">
            ${lead.documents.map((document) => `
              <a class="doc-link" href="/api/marketplace/leads/${lead.id}/documents/${document.id}/download">
                <strong>${document.documentTypeLabel}</strong>
                <span>${document.originalFilename}</span>
              </a>
            `).join("")}
          </div>
        ` : `
          <p class="muted-copy">No documents were uploaded with this lead.</p>
        `}
      </div>
      <div class="detail-section">
        <h4>Notes</h4>
        <p class="muted-copy">${lead.additionalComments || "No additional comments were submitted with this lead."}</p>
      </div>
    `;

    panel.querySelectorAll("[data-buy-lead]").forEach((button) => {
      button.addEventListener("click", () => buyLead(button.getAttribute("data-buy-lead")));
    });
  }

  async function loadAuth() {
    const data = await api("/auth/me", { method: "GET" });
    state.user = data.user;
  }

  async function loadMarketplace() {
    const params = new URLSearchParams();
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const data = await api(`/marketplace/leads${params.toString() ? `?${params.toString()}` : ""}`, { method: "GET" });
    state.access = data.access;
    state.leads = data.leads || [];
  }

  async function loadNotifications() {
    const data = await api("/marketplace/notifications", { method: "GET" });
    state.notifications = data.notifications || [];
  }

  async function refreshAll() {
    clearMessage();
    try {
      await Promise.all([loadAuth(), loadMarketplace(), loadNotifications()]);
      renderHeader();
      renderStats();
      renderNotifications();
      renderLeads();
      renderLeadDetail();
    } catch (error) {
      if (/401/.test(error.message) || /authentication/i.test(error.message)) {
        window.location.href = "login.html?redirect=/lead-marketplace.html";
        return;
      }
      setMessage("error", error.message);
    }
  }

  async function viewLead(leadId) {
    clearMessage();
    try {
      const data = await api(`/marketplace/leads/${leadId}`, { method: "GET" });
      state.activeLead = data.lead;
      renderLeadDetail();
    } catch (error) {
      setMessage("error", error.message);
    }
  }

  async function buyLead(leadId) {
    clearMessage();
    if (!window.confirm("Purchase this lead and reveal the carrier, contact, and document details?")) {
      return;
    }

    try {
      const result = await api(`/marketplace/leads/${leadId}/purchase`, { method: "POST" });
      setMessage("success", result.alreadyOwned
        ? "This lead was already unlocked for your account."
        : `Lead purchased successfully for ${fmtMoney(result.pricePaid)}.`);
      state.activeLead = result.lead;
      await Promise.all([loadMarketplace(), loadNotifications()]);
      renderHeader();
      renderStats();
      renderNotifications();
      renderLeads();
      renderLeadDetail();
    } catch (error) {
      setMessage("error", error.message);
    }
  }

  function bindFilters() {
    const form = byId("marketplaceFilters");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.filters.tier = byId("filterTier").value;
      state.filters.state = byId("filterState").value.trim();
      state.filters.status = byId("filterStatus").value;
      await refreshAll();
    });

    byId("filterReset").addEventListener("click", async () => {
      form.reset();
      state.filters = { tier: "", state: "", status: "" };
      await refreshAll();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    byId("year").textContent = new Date().getFullYear();
    bindFilters();
    await refreshAll();
  });
})();
