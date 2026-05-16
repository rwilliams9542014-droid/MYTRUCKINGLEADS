(function () {
  const API_BASE =
    window.MY_TRUCKING_LEADS_API_BASE ||
    document.documentElement.dataset.apiBase ||
    (["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "http://localhost:4000/api"
      : `${window.location.origin}/api`);

  const els = {};

  function $(id) {
    if (!els[id]) els[id] = document.getElementById(id);
    return els[id];
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

  function planLabel(plan) {
    return {
      basic: "Starter",
      starter: "Starter",
      pro: "Pro",
      premium: "Agency Unlimited",
      agency: "Agency Unlimited"
    }[String(plan || "").toLowerCase()] || titleCase(plan);
  }

  function isOwner(user) {
    return Boolean(user?.isOwner);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  function statusBadge(status) {
    const normalized = String(status || "unknown").toLowerCase();
    const cls = {
      active: "status-good",
      trialing: "status-good",
      processed: "status-good",
      incomplete: "status-warn",
      past_due: "status-warn",
      processing: "status-warn",
      canceled: "status-bad",
      unpaid: "status-bad",
      failed: "status-bad"
    }[normalized] || "status-neutral";

    return `<span class="status-pill ${cls}">${escapeHtml(titleCase(normalized))}</span>`;
  }

  function renderUsers(users) {
    $("userCount").textContent = String(users.length);
    $("usersBody").innerHTML = users.map((user) => {
      const displayName = user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || "No name";
      const stripeShort = user.stripe_subscription_id ? `${user.stripe_subscription_id.slice(0, 12)}...` : "None";
      const isLocalUser = user.is_local_user !== false;
      const businessName = user.business_name || "No business name";
      const leadState = user.lead_state || "All states / not set";
      const accountSource = isLocalUser
        ? ""
        : `<span class="status-pill status-warn">Stripe only</span><span>${escapeHtml(user.sync_issue || "Signup exists in Stripe but is not synced to the local user database yet.")}</span>`;
      const syncAction = isLocalUser
        ? `<button class="sync-user-btn" type="button" data-user-id="${user.id}">Sync Stripe</button>`
        : `<button class="sync-user-btn" type="button" disabled title="This signup is currently visible from Stripe only.">Stripe Only</button>`;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(displayName)}</strong>
            <span>${escapeHtml(user.email || "No email")}</span>
          </td>
          <td>
            <strong>${escapeHtml(user.username || "No username")}</strong>
            <span>${escapeHtml(businessName)}</span>
            <span>Lead state: ${escapeHtml(leadState)}</span>
            ${accountSource}
          </td>
          <td>${escapeHtml(planLabel(user.plan))}</td>
          <td>${statusBadge(user.subscription_status)}</td>
          <td>${formatDate(user.subscription_expires_at)}</td>
          <td>
            <strong>${escapeHtml(stripeShort)}</strong>
            <span>${user.has_access ? "Access allowed" : "Access limited"}</span>
          </td>
          <td>${formatDate(user.created_at)}</td>
          <td>${syncAction}</td>
        </tr>
      `;
    }).join("");
  }

  function renderHealth(health) {
    const summary = health.summary || [];
    const processed = summary.find((item) => item.status === "processed")?.count || 0;
    const failed = summary.find((item) => item.status === "failed")?.count || 0;
    const processing = summary.find((item) => item.status === "processing")?.count || 0;

    $("webhookSummary").innerHTML = `
      <div><strong>${processed}</strong><span>Processed, last 7 days</span></div>
      <div><strong>${processing}</strong><span>Processing</span></div>
      <div><strong>${failed}</strong><span>Failed</span></div>
    `;

    $("webhookBody").innerHTML = (health.recent || []).map((event) => `
      <tr>
        <td><strong>${escapeHtml(event.type)}</strong><span>${escapeHtml(event.id)}</span></td>
        <td>${statusBadge(event.status)}</td>
        <td>${event.livemode ? "Live" : "Test"}</td>
        <td>${escapeHtml(event.message || "OK")}</td>
        <td>${formatDate(event.processed_at)}</td>
      </tr>
    `).join("");
  }

  async function loadUsers() {
    $("adminStatus").textContent = "Loading subscribers...";
    const search = $("userSearch").value.trim();
    const users = await api(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    renderUsers(users.users || []);
    $("adminStatus").textContent = "Subscriber list is current.";
  }

  async function loadHealth() {
    const health = await api("/admin/webhook-health");
    renderHealth(health);
  }

  async function syncUser(userId, button) {
    button.disabled = true;
    button.textContent = "Syncing...";
    try {
      await api(`/admin/users/${encodeURIComponent(userId)}/sync-stripe`, { method: "POST" });
      await loadUsers();
      await loadHealth();
    } catch (err) {
      $("adminStatus").textContent = err.message;
    } finally {
      button.disabled = false;
      button.textContent = "Sync Stripe";
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
    $("refreshBtn").addEventListener("click", async () => {
      await loadUsers();
      await loadHealth();
    });
    $("userSearch").addEventListener("input", () => {
      clearTimeout(window.__adminSearchTimer);
      window.__adminSearchTimer = setTimeout(loadUsers, 300);
    });
    $("logoutBtn").addEventListener("click", logout);
    $("usersBody").addEventListener("click", (event) => {
      const button = event.target.closest(".sync-user-btn");
      if (!button) return;
      syncUser(button.dataset.userId, button);
    });

    try {
      const me = await api("/auth/me");
      if (!isOwner(me.user)) {
        window.location.replace("/user-dashboard.html");
        return;
      }

      $("ownerName").textContent = me.user.name || me.user.username || me.user.email || "Owner";
      await loadUsers();
      await loadHealth();
    } catch {
      localStorage.removeItem("user");
      window.location.replace(`/login.html?redirect=${encodeURIComponent("/admin.html")}`);
    }
  });
})();
