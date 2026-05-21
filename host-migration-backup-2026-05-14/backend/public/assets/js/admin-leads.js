(function () {
  const API_BASE =
    window.MY_TRUCKING_LEADS_API_BASE ||
    document.documentElement.dataset.apiBase ||
    `${window.location.origin}/api`;

  const state = {
    leads: [],
    activeLeadId: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  async function api(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
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
    return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  function setMessage(type, text) {
    const element = byId("adminLeadMessage");
    if (!element) return;
    element.hidden = false;
    element.className = `message-card message-${type}`;
    element.textContent = text;
  }

  function clearMessage() {
    const element = byId("adminLeadMessage");
    if (!element) return;
    element.hidden = true;
    element.textContent = "";
  }

  function tierClass(tier) {
    return `tier-${String(tier || "").toLowerCase()}`;
  }

  function getActiveLead() {
    return state.leads.find((lead) => Number(lead.id) === Number(state.activeLeadId)) || null;
  }

  function renderStats() {
    const total = state.leads.length;
    const available = state.leads.filter((lead) => lead.status === "Available").length;
    const purchased = state.leads.filter((lead) => lead.status === "Purchased").length;
    const gold = state.leads.filter((lead) => lead.leadTier === "Gold").length;

    byId("adminStatTotal").textContent = total;
    byId("adminStatAvailable").textContent = available;
    byId("adminStatPurchased").textContent = purchased;
    byId("adminStatGold").textContent = gold;
  }

  function renderLeadTable() {
    const container = byId("adminLeadRows");
    if (!container) return;

    if (!state.leads.length) {
      container.innerHTML = `<tr><td colspan="8" class="empty-row">No marketplace leads found yet.</td></tr>`;
      return;
    }

    container.innerHTML = state.leads.map((lead) => `
      <tr class="${Number(lead.id) === Number(state.activeLeadId) ? "active-row" : ""}" data-lead-row="${lead.id}">
        <td>${lead.id}</td>
        <td><span class="tier-pill ${tierClass(lead.leadTier)}">${lead.leadTier}</span></td>
        <td>${lead.companyName}</td>
        <td>${lead.state || "Multi-state"}</td>
        <td>${lead.fleetSize}</td>
        <td>${lead.leadScore}</td>
        <td>${lead.status}</td>
        <td>${fmtMoney(lead.listPrice || lead.price)}</td>
      </tr>
    `).join("");

    container.querySelectorAll("[data-lead-row]").forEach((row) => {
      row.addEventListener("click", () => {
        state.activeLeadId = Number(row.getAttribute("data-lead-row"));
        renderLeadTable();
        renderLeadDetail();
      });
    });
  }

  function renderLeadDetail() {
    const panel = byId("adminLeadDetail");
    if (!panel) return;

    const lead = getActiveLead();
    if (!lead) {
      panel.innerHTML = `
        <div class="detail-empty">
          <h3>Select a lead to manage</h3>
          <p>Review files, adjust lead pricing, and update purchase status from this panel.</p>
        </div>
      `;
      return;
    }

    panel.innerHTML = `
      <div class="detail-head">
        <div>
          <span class="tier-pill ${tierClass(lead.leadTier)}">${lead.leadTier} Lead</span>
          <h3>${lead.companyName}</h3>
          <p>${lead.contactName || "No contact name"} • ${lead.phoneNumber || "No phone"} • ${lead.emailAddress || "No email"}</p>
        </div>
        <div class="detail-price">${fmtMoney(lead.listPrice || lead.price)}</div>
      </div>

      <form id="adminLeadEditForm" class="edit-grid">
        <label>
          <span>Lead Tier</span>
          <select name="leadTier">
            ${["Bronze", "Silver", "Gold"].map((tier) => `<option value="${tier}"${tier === lead.leadTier ? " selected" : ""}>${tier}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Lead Score</span>
          <input name="leadScore" type="number" min="0" max="100" value="${lead.leadScore}" />
        </label>
        <label>
          <span>Lead Price</span>
          <input name="leadPrice" type="number" min="0" step="0.01" value="${Number(lead.listPrice || lead.price || 0)}" />
        </label>
        <label>
          <span>Status</span>
          <select name="status">
            ${["New", "Available", "Purchased", "Assigned", "Quoted", "Closed"].map((status) => `<option value="${status}"${status === lead.status ? " selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Assigned User ID</span>
          <input name="assignedUserId" type="number" min="1" value="${lead.assignedUserId || ""}" />
        </label>
        <label>
          <span>Exclusive Lead</span>
          <select name="isExclusive">
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <button type="submit" class="primary-button">Save Lead Changes</button>
      </form>

      <div class="section">
        <h4>Lead Summary</h4>
        <div class="detail-grid">
          <div><span>Renewal Date</span><strong>${lead.renewalDate || "Not provided"}</strong></div>
          <div><span>Coverage Needed</span><strong>${lead.coverageNeeded || "Not provided"}</strong></div>
          <div><span>Document Completion</span><strong>${lead.documentCompletionPercent}%</strong></div>
          <div><span>Submitted</span><strong>${fmtDate(lead.submittedAt)}</strong></div>
        </div>
      </div>

      <div class="section">
        <h4>Purchases</h4>
        ${lead.purchases && lead.purchases.length ? `
          <div class="sub-list">
            ${lead.purchases.map((purchase) => `
              <div class="sub-item">
                <strong>${purchase.name || "User"} • ${fmtMoney(purchase.pricePaid)}</strong>
                <span>${purchase.email || "No email"} • ${purchase.usedCredit ? "Used credit" : "Paid"} • ${fmtDate(purchase.createdAt)}</span>
              </div>
            `).join("")}
          </div>
        ` : `<p class="muted-copy">No purchases have been recorded for this lead yet.</p>`}
      </div>

      <div class="section">
        <h4>Uploaded Documents</h4>
        ${lead.documents && lead.documents.length ? `
          <div class="sub-list">
            ${lead.documents.map((document) => `
              <div class="sub-item">
                <div>
                  <strong>${document.documentTypeLabel}</strong>
                  <span>${document.originalFilename} • ${document.status} • ${fmtDate(document.uploadedAt)}</span>
                </div>
                <div class="doc-actions">
                  <a class="ghost-button" href="/api/marketplace/admin/leads/${lead.id}/documents/${document.id}/download">Download</a>
                  <button type="button" class="ghost-button" data-doc-status="${document.id}:approved">Approve</button>
                  <button type="button" class="ghost-button" data-doc-status="${document.id}:rejected">Reject</button>
                  <button type="button" class="danger-button" data-doc-delete="${document.id}">Delete</button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<p class="muted-copy">No documents uploaded for this lead.</p>`}
      </div>
    `;

    const exclusiveSelect = panel.querySelector('[name="isExclusive"]');
    if (exclusiveSelect) {
      exclusiveSelect.value = lead.isExclusive ? "true" : "false";
    }

    panel.querySelector("#adminLeadEditForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const payload = {
        leadTier: formData.get("leadTier"),
        leadScore: Number(formData.get("leadScore")),
        leadPrice: Number(formData.get("leadPrice")),
        status: formData.get("status"),
        assignedUserId: formData.get("assignedUserId") ? Number(formData.get("assignedUserId")) : null,
        isExclusive: formData.get("isExclusive") === "true"
      };

      try {
        await api(`/marketplace/admin/leads/${lead.id}`, {
          method: "PATCH",
          body: payload
        });
        setMessage("success", "Lead settings updated.");
        await loadLeads();
      } catch (error) {
        setMessage("error", error.message);
      }
    });

    panel.querySelectorAll("[data-doc-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [documentId, status] = button.getAttribute("data-doc-status").split(":");
        try {
          await api(`/marketplace/admin/leads/${lead.id}/documents/${documentId}`, {
            method: "PATCH",
            body: { status }
          });
          setMessage("success", `Document marked ${status}.`);
          await loadLeads();
        } catch (error) {
          setMessage("error", error.message);
        }
      });
    });

    panel.querySelectorAll("[data-doc-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        const documentId = button.getAttribute("data-doc-delete");
        if (!window.confirm("Delete this uploaded file from the lead record?")) {
          return;
        }
        try {
          await api(`/marketplace/admin/leads/${lead.id}/documents/${documentId}`, {
            method: "DELETE"
          });
          setMessage("success", "Document deleted.");
          await loadLeads();
        } catch (error) {
          setMessage("error", error.message);
        }
      });
    });
  }

  async function loadLeads() {
    clearMessage();
    const data = await api("/marketplace/admin/leads", { method: "GET" });
    state.leads = data.leads || [];

    if (!state.activeLeadId && state.leads.length) {
      state.activeLeadId = Number(state.leads[0].id);
    }

    if (state.activeLeadId && !state.leads.some((lead) => Number(lead.id) === Number(state.activeLeadId))) {
      state.activeLeadId = state.leads.length ? Number(state.leads[0].id) : null;
    }

    renderStats();
    renderLeadTable();
    renderLeadDetail();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    byId("year").textContent = new Date().getFullYear();

    try {
      await loadLeads();
    } catch (error) {
      if (/401/.test(error.message) || /403/.test(error.message) || /owner/i.test(error.message)) {
        window.location.href = "/login.html?redirect=/admin-leads.html";
        return;
      }
      setMessage("error", error.message);
    }
  });
})();
