(function () {
  const API_BASE =
    window.MY_TRUCKING_LEADS_API_BASE ||
    document.documentElement.dataset.apiBase ||
    (["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "http://localhost:4000/api"
      : `${window.location.origin}/api`);

  async function logout() {
    // Call logout endpoint to clear httpOnly cookie
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (err) {
      // Even if logout fails, clear local state
      console.error("Logout error:", err);
    } finally {
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");
      window.location.href = "/";
    }
  }

  function loginRedirectPath() {
    const path = `${window.location.pathname}${window.location.search}`;
    return `login.html?redirect=${encodeURIComponent(path)}`;
  }

  function normalizePlan(plan) {
    if (plan === "starter") return "basic";
    if (plan === "agency") return "premium";
    return plan || "basic";
  }

  function hasPaidAccess(user) {
    const plan = normalizePlan(user?.plan);
    const status = String(user?.subscription_status || "").toLowerCase();
    const isLocalDev = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    return ["basic", "pro", "premium"].includes(plan) && (isLocalDev || ["active", "trialing"].includes(status));
  }

  function getPlanLabel(plan) {
    return {
      basic: "Starter",
      pro: "Pro",
      premium: "Agency Unlimited"
    }[normalizePlan(plan)] || "Lead Plan";
  }

  function applyPlanAccess(user) {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    const pendingPlan = localStorage.getItem("pendingPlan");
    if (sessionId && pendingPlan && user) {
      user.plan = pendingPlan;
      user.subscription_status = user.subscription_status || "active";
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.removeItem("pendingPlan");
    }

    const plan = normalizePlan(user?.plan);
    const path = window.location.pathname.split("/").pop() || "app-dashboard.html";

    if (!hasPaidAccess(user) && path !== "pricing.html") {
      window.location.href = "pricing.html";
      return;
    }

    const newVentureTab = document.getElementById("new-venture-tab");
    if (newVentureTab) newVentureTab.title = "New DOT leads are included in every lead plan.";

    const renewalTab = document.getElementById("renewal-tab");
    if (renewalTab && plan === "basic") {
      renewalTab.title = "Renewal access is included with Starter, Pro, and Agency Unlimited.";
    }
  }

  async function syncCheckoutSessionIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    try {
      await fetch(`${API_BASE}/billing/checkout-status?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });
    } catch (err) {
      console.warn("Checkout sync delayed:", err.message);
    }
  }

  async function verifyAuthentication() {
    // Verify the user is still authenticated with the server
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        // Not authenticated, redirect to login
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        window.location.replace(loginRedirectPath());
        return null;
      }

      const data = await response.json();
      return data.user;
    } catch {
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");
      window.location.replace(loginRedirectPath());
      return null;
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const isLocalDashboardPreview =
      ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
      document.body.classList.contains("producer-dashboard");

    if (isLocalDashboardPreview) {
      const previewUser = {
        name: "Local Preview",
        email: "preview@mytruckingleads.local",
        plan: "premium",
        subscription_status: "active"
      };
      localStorage.setItem("user", JSON.stringify(previewUser));

      const nameElement = document.getElementById("currentUserName");
      const logoutButton = document.getElementById("logoutBtn");
      if (nameElement) {
        nameElement.textContent = `${previewUser.name} (${getPlanLabel(previewUser.plan)})`;
      }
      if (logoutButton) {
        logoutButton.addEventListener("click", logout);
      }
      return;
    }

    await syncCheckoutSessionIfPresent();

    const user = await verifyAuthentication();
    if (!user) return; // Redirect happened
    localStorage.setItem("user", JSON.stringify(user));

    const nameElement = document.getElementById("currentUserName");
    const logoutButton = document.getElementById("logoutBtn");

    applyPlanAccess(user);

    if (nameElement && user) {
      nameElement.textContent = `${user.name || user.email || "Your account"} (${getPlanLabel(user.plan)})`;
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", logout);
    }
  });
})();
