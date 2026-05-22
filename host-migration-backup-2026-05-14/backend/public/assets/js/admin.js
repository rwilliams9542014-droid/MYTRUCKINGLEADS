(function () {
  const API_BASE =
    window.MY_TRUCKING_LEADS_API_BASE ||
    document.documentElement.dataset.apiBase ||
    (["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "http://localhost:4000/api"
      : `${window.location.origin}/api`);

  const els = {};
  const state = {
    me: null,
    overview: null,
    users: []
  };

  function $(id) {
    if (!els[id]) els[id] = document.getElementById(id);
    return els[id];
  }

  function titleCase(value) {
    return String(value || "unknown")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "Not set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not set";
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatRelative(value) {
    if (!value) return "No date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No date";

    const deltaMs = date.getTime() - Date.now();
    const deltaMinutes = Math.round(deltaMs / 60000);
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (Math.abs(deltaMinutes) < 60) {
      return formatter.format(deltaMinutes, "minute");
    }

    const deltaHours = Math.round(deltaMinutes / 60);
    if (Math.abs(deltaHours) < 48) {
      return formatter.format(deltaHours, "hour");
    }

    const deltaDays = Math.round(deltaHours / 24);
    return formatter.format(deltaDays, "day");
  }

  function planLabel(plan) {
    return {
      basic: "Starter",
      starter: "Starter",
      pro: "Pro",
      premium: "Agency Unlimited",
      agency: "Agency Unlimited"
    }[String(plan || "").toLowerCase()] || titleCase(plan);
  }

  function normalizeInternalPlan(plan) {
    const normalized = String(plan || "").toLowerCase();
    if (normalized === "starter") return "basic";
    if (normalized === "agency") return "premium";
    return normalized || "basic";
  }

  function isOwner(user) {
    return Boolean(user?.isOwner);
  }

  function statusTone(status) {
    const normalized = String(status || "").toLowerCase();
    if (["active", "trialing", "processed", "resolved", "reviewed", "sent"].includes(normalized)) return "status-good";
    if (["incomplete", "past_due", "processing", "new"].includes(normalized)) return "status-warn";
    if (["canceled", "unpaid", "failed"].includes(normalized)) return "status-bad";
    return "status-neutral";
  }

  function statusBadge(status, label = null) {
    return `<span class="status-pill ${statusTone(status)}">${escapeHtml(label || titleCase(status || "unknown"))}</span>`;
  }

  function planBadge(plan) {
    return `<span class="plan-pill">${escapeHtml(planLabel(plan))}</span>`;
  }

  function setAdminStatus(headline, note = "") {
    $("adminStatus").textContent = headline;
    $("adminStatusNote").textContent = note;
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      method: options.method || "GET",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Request failed: ${response.status}`);
    }

    return body;
  }

  function syncLocalUser(user) {
    if (!user) return;
    localStorage.setItem("user", JSON.stringify(user));
  }

  async function loadMe() {
    const me = await api("/auth/me");
    if (!isOwner(me.user)) {
      window.location.replace("/user-dashboard.html");
      return null;
    }

    state.me = me.user;
    syncLocalUser(me.user);
    $("ownerName").textContent = me.user.name || me.user.username || me.user.email || "Owner";
    renderPreviewBanner(me.user);
    fillPreviewForm(me.user);
    return me.user;
  }

  function renderPreviewBanner(user) {
    const preview = user?.ownerPreview || { active: false };
    const banner = $("ownerPreviewBanner");
    if (!banner) return;

    if (preview.active) {
      banner.innerHTML = `
        <i class="bi bi-incognito"></i>
        <div>
          <strong>Previewing ${escapeHtml(planLabel(preview.internalPlan))} access as ${escapeHtml(titleCase(preview.subscriptionStatus))}${preview.leadState ? ` in ${escapeHtml(preview.leadState)}` : ""}.</strong>
          <span>Your real owner account remains ${escapeHtml(planLabel(preview.actualInternalPlan))} with ${escapeHtml(titleCase(preview.actualSubscriptionStatus || "unknown"))}${preview.actualLeadState ? ` and lead state ${escapeHtml(preview.actualLeadState)}` : ""}. Preview started ${escapeHtml(formatRelative(preview.savedAt))}.</span>
        </div>
      `;
      return;
    }

    banner.innerHTML = `
      <i class="bi bi-shield-check"></i>
      <div>
        <strong>Live owner access is active.</strong>
        <span>You are using the real owner account right now: ${escapeHtml(planLabel(preview.actualInternalPlan || user?.plan))}${preview.actualLeadState ? ` in ${escapeHtml(preview.actualLeadState)}` : ""}. Use preview mode below when you want to reproduce a user-tier issue safely.</span>
      </div>
    `;
  }

  function fillPreviewForm(user) {
    const preview = user?.ownerPreview || {};
    const plan = normalizeInternalPlan(preview.active ? preview.internalPlan : preview.actualInternalPlan || user?.plan);
    const status = String(preview.active ? preview.subscriptionStatus : preview.actualSubscriptionStatus || user?.subscription_status || "active").toLowerCase();
    const leadState = String(preview.active ? preview.leadState || "" : preview.actualLeadState || user?.leadState || "").toUpperCase();

    $("previewPlan").value = plan || "basic";
    $("previewStatus").value = status || "active";
    $("previewState").value = leadState;
  }

  function renderMetrics(metrics = {}) {
    $("metricAccessEnabled").textContent = String(metrics.access_enabled_users || 0);
    $("metricActiveSubscriptions").textContent = String(metrics.active_subscriptions || 0);
    $("metricTrials").textContent = String(metrics.trial_subscriptions || 0);
    $("metricAttention").textContent = String(metrics.attention_subscriptions || 0);
    $("metricExpiringSoon").textContent = String(metrics.expiring_soon || 0);
    $("metricContactRequests").textContent = String(metrics.new_contact_requests || 0);
  }

  function renderPlanBreakdown(rows = []) {
    const container = $("planBreakdown");
    if (!container) return;

    if (!rows.length) {
      container.innerHTML = `<div class="section-empty">No subscription records available yet.</div>`;
      return;
    }

    container.innerHTML = rows.map((row) => `
      <div class="breakdown-row">
        <div>
          <strong>${escapeHtml(planLabel(row.plan))}</strong>
          <div class="request-meta">
            <span>${escapeHtml(row.total)} total</span>
            <span>${escapeHtml(row.active)} active</span>
            <span>${escapeHtml(row.trialing)} trials</span>
          </div>
        </div>
        <div class="mini-stat">${escapeHtml(row.attention)} attention</div>
      </div>
    `).join("");
  }

  function renderContactRequests(contactRequests = {}) {
    const counts = contactRequests.counts || {};
    const rows = contactRequests.recent || [];

    $("contactStatusSummary").textContent = `${counts.new_count || 0} new, ${counts.reviewed_count || 0} reviewed, ${counts.resolved_count || 0} resolved. ${counts.delivery_issue_count || 0} email delivery issues.`;

    if (!rows.length) {
      $("contactRequestRows").innerHTML = `<div class="section-empty">No contact requests have been stored yet.</div>`;
      return;
    }

    $("contactRequestRows").innerHTML = rows.map((request) => `
      <div class="request-card">
        <div class="d-flex justify-content-between gap-3 flex-wrap">
          <div>
            <strong>${escapeHtml(request.name || "Unknown requester")}</strong>
            ${statusBadge(request.status)}
            ${statusBadge(request.email_delivery_status, request.email_delivery_status === "sent" ? "Email Sent" : "Delivery Issue")}
          </div>
          <div class="mini-stat">${escapeHtml(formatRelative(request.submitted_at))}</div>
        </div>
        <div class="request-meta">
          <span>${escapeHtml(request.email || "No email")}</span>
          <span>${escapeHtml(request.phone || "No phone")}</span>
          <span>${escapeHtml(request.agency || "No agency")}</span>
        </div>
        <p>${escapeHtml(request.message || "No message provided.")}</p>
        <div class="request-meta">
          <span>Source: ${escapeHtml(request.source_page || "Website contact form")}</span>
          <span>Submitted: ${escapeHtml(formatDate(request.submitted_at))}</span>
          ${request.email_delivery_message ? `<span>${escapeHtml(request.email_delivery_message)}</span>` : ""}
        </div>
        <div class="request-actions">
          <a class="owner-mini-btn primary" href="mailto:${encodeURIComponent(request.email || "")}"><i class="bi bi-envelope"></i> Reply</a>
          <button class="owner-mini-btn" type="button" data-request-id="${request.id}" data-request-status="reviewed"><i class="bi bi-eye"></i> Mark Reviewed</button>
          <button class="owner-mini-btn" type="button" data-request-id="${request.id}" data-request-status="resolved"><i class="bi bi-check2-circle"></i> Resolve</button>
        </div>
      </div>
    `).join("");
  }

  function renderWebhook(webhook = {}) {
    const summary = webhook.summary || [];
    const recent = (webhook.recent || []).slice(0, 8);
    const processed = summary.find((item) => item.status === "processed")?.count || 0;
    const failed = summary.find((item) => item.status === "failed")?.count || 0;
    const processing = summary.find((item) => item.status === "processing")?.count || 0;

    $("webhookSummary").innerHTML = `
      <div class="breakdown-row">
        <div>
          <strong>Processed Events</strong>
          <div class="request-meta"><span>Last 7 days</span></div>
        </div>
        <div class="mini-stat">${escapeHtml(processed)}</div>
      </div>
      <div class="breakdown-row">
        <div>
          <strong>Still Processing</strong>
          <div class="request-meta"><span>Webhook jobs in flight</span></div>
        </div>
        <div class="mini-stat">${escapeHtml(processing)}</div>
      </div>
      <div class="breakdown-row">
        <div>
          <strong>Failed Events</strong>
          <div class="request-meta"><span>Needs review</span></div>
        </div>
        <div class="mini-stat">${escapeHtml(failed)}</div>
      </div>
    `;

    if (!recent.length) {
      $("webhookBody").innerHTML = `<div class="section-empty">No recent webhook events recorded.</div>`;
      return;
    }

    $("webhookBody").innerHTML = recent.map((event) => `
      <div class="webhook-item">
        <div class="d-flex justify-content-between gap-3 flex-wrap">
          <div>
            <strong>${escapeHtml(event.type)}</strong>
            ${statusBadge(event.status)}
          </div>
          <div class="mini-stat">${event.livemode ? "Live" : "Test"}</div>
        </div>
        <p>${escapeHtml(event.message || "OK")}</p>
        <div class="webhook-meta">
          <span>${escapeHtml(event.id)}</span>
          <span>${escapeHtml(formatDate(event.processed_at))}</span>
        </div>
      </div>
    `).join("");
  }

  function renderUsers(users) {
    state.users = users;
    $("userCount").textContent = String(users.length);

    if (!users.length) {
      $("usersBody").innerHTML = `
        <tr>
          <td colspan="6">
            <div class="section-empty">No users matched the current filters.</div>
          </td>
        </tr>
      `;
      return;
    }

    $("usersBody").innerHTML = users.map((user) => {
      const displayName = user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || "No name";
      const username = user.username || "No username";
      const businessName = user.business_name || "No business name";
      const leadState = user.lead_state || "Not set";
      const stripeSubscription = user.stripe_subscription_id || "No Stripe subscription";
      const stripeCustomer = user.stripe_customer_id || "No customer id";
      const accessLabel = user.has_access ? "Access enabled" : "Access limited";
      const accountSource = user.is_local_user === false ? "Stripe only" : "Local account";
      const syncAction = user.is_local_user === false
        ? `<button class="owner-mini-btn" type="button" disabled title="This record exists in Stripe but is not synced to a local user yet."><i class="bi bi-cloud-slash"></i> Stripe Only</button>`
        : `<button class="owner-mini-btn primary sync-user-btn" type="button" data-user-id="${user.id}"><i class="bi bi-arrow-repeat"></i> Sync Stripe</button>`;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(displayName)}</strong>
            <span>${escapeHtml(user.email || "No email")}</span>
            <span>${escapeHtml(username)}</span>
          </td>
          <td>
            ${planBadge(user.plan)}
            ${statusBadge(user.subscription_status)}
            <span>Ends: ${escapeHtml(formatDate(user.subscription_expires_at))}</span>
          </td>
          <td>
            <strong>${escapeHtml(leadState)}</strong>
            <span>${escapeHtml(accessLabel)}</span>
            <span>${escapeHtml(accountSource)}</span>
          </td>
          <td>
            <strong>${escapeHtml(stripeSubscription)}</strong>
            <span>${escapeHtml(stripeCustomer)}</span>
            ${user.sync_issue ? `<span>${escapeHtml(user.sync_issue)}</span>` : `<span>${escapeHtml(businessName)}</span>`}
          </td>
          <td>
            <strong>${escapeHtml(formatDate(user.created_at))}</strong>
            <span>${escapeHtml(formatRelative(user.created_at))}</span>
          </td>
          <td>
            <div class="table-actions">
              ${syncAction}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadOverview() {
    const overview = await api("/admin/overview");
    state.overview = overview;
    renderMetrics(overview.metrics || {});
    renderPlanBreakdown(overview.planBreakdown || []);
    renderContactRequests(overview.contactRequests || {});
    renderWebhook(overview.webhook || {});
  }

  async function loadUsers() {
    const search = $("userSearch").value.trim();
    const plan = $("planFilter").value;
    const status = $("subscriptionStatusFilter").value;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (plan) params.set("plan", plan);
    if (status) params.set("status", status);

    const payload = await api(`/admin/users${params.toString() ? `?${params.toString()}` : ""}`);
    renderUsers(payload.users || []);
  }

  async function refreshDashboard() {
    setAdminStatus("Refreshing owner data...", "Loading subscriptions, contact requests, and webhook activity.");
    await Promise.all([loadOverview(), loadUsers()]);
    setAdminStatus("Owner console is current.", "Preview mode, subscriber data, and contact notices are all up to date.");
  }

  async function applyPreview(event) {
    event.preventDefault();

    const submitButton = event.submitter || event.target.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await api("/admin/preview-session", {
        method: "POST",
        body: {
          plan: $("previewPlan").value,
          subscriptionStatus: $("previewStatus").value,
          leadState: $("previewState").value.trim().toUpperCase()
        }
      });
      await loadMe();
      setAdminStatus("Preview mode applied.", "Open the dashboard, settings, or DOT analytics to test the selected plan experience.");
    } catch (err) {
      setAdminStatus("Preview update failed.", err.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function clearPreview() {
    const button = $("clearPreviewBtn");
    button.disabled = true;
    try {
      await api("/admin/preview-session", { method: "DELETE" });
      await loadMe();
      setAdminStatus("Returned to live owner access.", "Preview mode is cleared and the real owner account state is active again.");
    } catch (err) {
      setAdminStatus("Could not clear preview mode.", err.message);
    } finally {
      button.disabled = false;
    }
  }

  async function syncUser(userId, button) {
    button.disabled = true;
    button.innerHTML = `<i class="bi bi-arrow-repeat"></i> Syncing`;
    try {
      await api(`/admin/users/${encodeURIComponent(userId)}/sync-stripe`, { method: "POST" });
      await refreshDashboard();
    } catch (err) {
      setAdminStatus("Stripe sync failed.", err.message);
    } finally {
      button.disabled = false;
      button.innerHTML = `<i class="bi bi-arrow-repeat"></i> Sync Stripe`;
    }
  }

  async function updateContactRequestStatus(requestId, status, button) {
    button.disabled = true;
    try {
      await api(`/admin/contact-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        body: { status }
      });
      await loadOverview();
      setAdminStatus("Contact request updated.", `The request was marked ${titleCase(status)}.`);
    } catch (err) {
      setAdminStatus("Could not update the contact request.", err.message);
    } finally {
      button.disabled = false;
    }
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("Logout failed:", err.message);
    } finally {
      localStorage.removeItem("user");
      localStorage.removeItem("authToken");
      window.location.href = "/";
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("refreshBtn").addEventListener("click", refreshDashboard);
    $("clearFiltersBtn").addEventListener("click", async () => {
      $("userSearch").value = "";
      $("planFilter").value = "";
      $("subscriptionStatusFilter").value = "";
      await loadUsers();
      setAdminStatus("Subscriber filters cleared.", "Showing the latest full subscriber list.");
    });

    $("userSearch").addEventListener("input", () => {
      clearTimeout(window.__adminSearchTimer);
      window.__adminSearchTimer = setTimeout(() => {
        loadUsers().catch((err) => setAdminStatus("Search failed.", err.message));
      }, 250);
    });

    $("planFilter").addEventListener("change", () => {
      loadUsers().catch((err) => setAdminStatus("Plan filter failed.", err.message));
    });

    $("subscriptionStatusFilter").addEventListener("change", () => {
      loadUsers().catch((err) => setAdminStatus("Status filter failed.", err.message));
    });

    $("previewForm").addEventListener("submit", applyPreview);
    $("clearPreviewBtn").addEventListener("click", clearPreview);
    $("logoutBtn").addEventListener("click", logout);

    $("usersBody").addEventListener("click", (event) => {
      const button = event.target.closest(".sync-user-btn");
      if (!button) return;
      syncUser(button.dataset.userId, button);
    });

    $("contactRequestRows").addEventListener("click", (event) => {
      const button = event.target.closest("[data-request-id][data-request-status]");
      if (!button) return;
      updateContactRequestStatus(button.dataset.requestId, button.dataset.requestStatus, button);
    });

    try {
      const me = await loadMe();
      if (!me) return;
      await refreshDashboard();
    } catch (err) {
      localStorage.removeItem("user");
      setAdminStatus("Owner session could not be verified.", "Redirecting to login.");
      window.location.replace(`/login.html?redirect=${encodeURIComponent("/admin.html")}`);
    }
  });
})();
