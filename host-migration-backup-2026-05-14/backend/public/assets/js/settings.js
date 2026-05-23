import { apiCall, cancelSubscription, isAuthenticated, getCurrentUser, refreshCurrentUser } from "./api.js";

function normalizePlan(plan) {
  if (plan === "starter") return "basic";
  if (plan === "agency") return "premium";
  return plan || "basic";
}

function getPlanLabel(plan) {
  return {
    basic: "Starter",
    pro: "Pro",
    premium: "Agency Unlimited"
  }[normalizePlan(plan)] || "Lead Plan";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setMessage(type, message) {
  const element = document.getElementById("teamMessage");
  if (!element) return;
  element.className = `alert alert-${type} py-2 small`;
  element.textContent = message;
}

function setSubscriptionMessage(type, message) {
  const element = document.getElementById("subscriptionMessage");
  if (!element) return;
  element.className = `alert alert-${type} py-2 small`;
  element.textContent = message;
}

function setInviteLink(url = "") {
  const wrap = document.getElementById("teamInviteLinkWrap");
  const input = document.getElementById("teamInviteLink");
  if (!wrap || !input) return;

  if (!url) {
    input.value = "";
    wrap.classList.add("d-none");
    return;
  }

  input.value = url;
  wrap.classList.remove("d-none");
}

function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeEmailAddress(value) {
  const email = String(value || "").trim();
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) ? email : "";
}

function renderEmailLink(value) {
  const email = normalizeEmailAddress(value);
  if (!email) return escapeHtml(value);

  return `<a class="email-link" href="mailto:${escapeHtml(email)}" title="Send email to ${escapeHtml(email)}">${escapeHtml(email)}</a>`;
}

function renderAccess(access, usedLogins) {
  const plan = normalizePlan(access?.plan || getCurrentUser()?.plan);
  const userLimit = access?.userLimit === null ? "Unlimited" : access?.userLimit || "-";
  const renewalWindow = access?.canUseRenewalLeads ? "Included" : "Not included";

  setText("settingsPlan", getPlanLabel(plan));
  setText("settingsRenewalWindow", renewalWindow);
  setText("settingsUserLimit", userLimit);
  setText("settingsUsedLogins", usedLogins || "1");

  const accessList = document.getElementById("settingsAccessList");
  if (!accessList) return;

  const items = [
    ["New DOT leads", Boolean(access?.canUseNewVentures)],
    ["Renewal leads", Boolean(access?.canUseRenewalLeads)],
    ["One-state targeting", Boolean(access?.requiresSingleState)],
    ["All-state search", Boolean(access?.canSearchAllStates)],
    ["Contact information", Boolean(access?.canViewContacts)],
    ["Carrier Intelligence Assistant", Boolean(access?.canUseCarrierIntelligenceAssistant)]
  ];

  accessList.innerHTML = items.map(([label, enabled]) => `
    <span class="${enabled ? "is-enabled" : "is-locked"}">
      ${enabled ? "Included" : "Locked"}: ${escapeHtml(label)}
    </span>
  `).join("");
}

const schemeMeta = {
  clean: ["#0d9fb0", "#18d4c3", "#f5b21b"],
  ocean: ["#1e40af", "#0d9488", "#dbeafe"],
  harvest: ["#b45309", "#d97706", "#fef3c7"],
  slate: ["#1d4ed8", "#2563eb", "#dbeafe"],
  midnight: ["#115e59", "#0f766e", "#111827"],
  evergreen: ["#124034", "#2f7d62", "#b7791f"],
  plum: ["#5b21b6", "#7c3aed", "#0f766e"]
};

function renderAppearanceControls() {
  if (!window.MyTruckingLeadsTheme) return;

  const displayCards = document.getElementById("displayModeCards");
  const displayModeSelect = document.getElementById("displayModeSelect");
  const colorSchemeCards = document.getElementById("colorSchemeCards");
  const colorSchemeSelect = document.getElementById("colorSchemeSelect");

  function syncDisplayCards() {
    const active = window.MyTruckingLeadsTheme.getDisplayMode();
    if (displayModeSelect) displayModeSelect.value = active;
    displayCards?.querySelectorAll("[data-display-mode-card]").forEach((card) => {
      card.classList.toggle("active", card.dataset.displayModeCard === active);
    });
  }

  function syncSchemeCards() {
    const active = window.MyTruckingLeadsTheme.getScheme();
    if (colorSchemeSelect) colorSchemeSelect.value = active;
    colorSchemeCards?.querySelectorAll("[data-scheme-card]").forEach((card) => {
      card.classList.toggle("active", card.dataset.schemeCard === active);
    });
  }

  displayCards?.querySelectorAll("[data-display-mode-card]").forEach((card) => {
    card.addEventListener("click", () => {
      window.MyTruckingLeadsTheme.setDisplayMode(card.dataset.displayModeCard);
      syncDisplayCards();
      syncSchemeCards();
    });
  });

  if (colorSchemeCards && !colorSchemeCards.dataset.rendered) {
    colorSchemeCards.dataset.rendered = "true";
    colorSchemeCards.innerHTML = Object.entries(window.MyTruckingLeadsTheme.schemes).map(([key, scheme]) => {
      const swatches = schemeMeta[key] || [scheme.primary, scheme.accent, scheme.accentSoft];
      return `
        <button class="scheme-card" type="button" data-scheme-card="${escapeHtml(key)}">
          <div>
            <strong>${escapeHtml(scheme.label)}</strong>
            <div class="small text-muted">Balanced for tables, dashboards, and CRM work.</div>
          </div>
          <div class="scheme-swatches" aria-hidden="true">
            ${swatches.map((color) => `<span style="background:${escapeHtml(color)}"></span>`).join("")}
          </div>
          <div class="scheme-preview" aria-hidden="true">
            <div class="scheme-lines"><span></span><span style="width:72%"></span><span style="width:48%"></span></div>
            <div class="scheme-cta" style="background:${escapeHtml(swatches[1])}"></div>
          </div>
        </button>
      `;
    }).join("");
    colorSchemeCards.querySelectorAll("[data-scheme-card]").forEach((card) => {
      card.addEventListener("click", () => {
        window.MyTruckingLeadsTheme.setScheme(card.dataset.schemeCard);
        syncSchemeCards();
        syncDisplayCards();
      });
    });
  }

  syncDisplayCards();
  syncSchemeCards();
}

function renderTeam(members) {
  const tbody = document.getElementById("teamMembersBody");
  if (!tbody) return;

  if (!members.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center small text-muted py-4">
          No extra logins invited yet. The account owner counts as one login.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = members.map((member) => `
    <tr>
      <td>${escapeHtml(member.name || "")}</td>
      <td>${renderEmailLink(member.email)}</td>
      <td>${escapeHtml(member.role)}</td>
      <td>${escapeHtml(member.status)}</td>
      <td class="text-end">
        <button class="btn btn-outline-danger btn-sm team-remove-btn" data-id="${escapeHtml(member.id)}">Remove</button>
      </td>
    </tr>
  `).join("");
}

async function loadTeam() {
  try {
    const data = await apiCall("/team");
    renderAccess(data.access, data.usedLogins);
    renderTeam(data.members || []);
  } catch (err) {
    setMessage("warning", err.message || "Unable to load team settings.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  renderAppearanceControls();

  if (!isAuthenticated()) {
    const user = await refreshCurrentUser().catch(() => null);
    if (!user) {
      window.location.replace("login.html?redirect=/settings.html");
      return;
    }
  }

  loadTeam();

  const cancelButton = document.getElementById("cancelSubscriptionBtn");
  if (cancelButton) {
    cancelButton.addEventListener("click", async () => {
      const confirmed = window.confirm(
        "Cancel your subscription? If you are still in the 3-day trial, you will not be charged. If your paid month already started, access remains until the paid period ends and you will not renew."
      );

      if (!confirmed) return;

      cancelButton.disabled = true;
      cancelButton.textContent = "Canceling...";

      try {
        const result = await cancelSubscription();
        await refreshCurrentUser().catch(() => null);
        setSubscriptionMessage("success", result.message || "Subscription canceled.");
        await loadTeam();
      } catch (err) {
        setSubscriptionMessage("danger", err.message || "Unable to cancel subscription.");
      } finally {
        cancelButton.disabled = false;
        cancelButton.textContent = "Cancel Plan";
      }
    });
  }

  const form = document.getElementById("teamInviteForm");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("teamInviteName")?.value?.trim() || "";
      const email = document.getElementById("teamInviteEmail")?.value?.trim() || "";

      try {
        const data = await apiCall("/team/invite", {
          method: "POST",
          body: { name, email }
        });
        if (data.emailSent === false) {
          setMessage("warning", data.warning || "Invite created, but the email could not be sent.");
          setInviteLink(data.inviteUrl || "");
        } else {
          setMessage("success", data.message || "Invitation email sent.");
          setInviteLink("");
        }
        form.reset();
        renderAccess(data.access, data.usedLogins);
        await loadTeam();
      } catch (err) {
        setInviteLink("");
        setMessage(err.status === 403 ? "warning" : "danger", err.message || "Unable to invite team member.");
      }
    });
  }

  const inviteCopyButton = document.getElementById("teamInviteCopyBtn");
  if (inviteCopyButton) {
    inviteCopyButton.addEventListener("click", async () => {
      const inviteLink = document.getElementById("teamInviteLink")?.value || "";
      if (!inviteLink) return;

      try {
        await navigator.clipboard.writeText(inviteLink);
        setMessage("success", "Invite link copied.");
      } catch {
        setMessage("warning", "Unable to copy automatically. You can still copy the invite link manually.");
      }
    });
  }

  const tbody = document.getElementById("teamMembersBody");
  if (tbody) {
    tbody.addEventListener("click", async (event) => {
      const button = event.target.closest(".team-remove-btn");
      if (!button) return;

      try {
        await apiCall(`/team/${button.dataset.id}`, { method: "DELETE" });
        setInviteLink("");
        setMessage("success", "Team login removed.");
        await loadTeam();
      } catch (err) {
        setMessage("danger", err.message || "Unable to remove team member.");
      }
    });
  }
});
