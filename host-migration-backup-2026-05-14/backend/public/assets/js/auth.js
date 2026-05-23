(function () {
  const IS_LOCAL_DEV =
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

  const API_BASE =
    window.MY_TRUCKING_LEADS_API_BASE ||
    document.documentElement.dataset.apiBase ||
    (IS_LOCAL_DEV
      ? "http://localhost:4000/api"
      : `${window.location.origin}/api`);

  function setMessage(element, type, message) {
    if (!element) return;

    element.className = `alert alert-${type}`;
    element.textContent = message;
    element.classList.remove("d-none");
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = loadingText;
      return;
    }

    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
  }

  function getDashboardForUser(user) {
    if (IS_LOCAL_DEV) return "user-dashboard.html";

    const plan = user?.plan || "basic";
    const status = String(user?.subscription_status || "").toLowerCase();
    const hasPaidAccess = ["basic", "pro", "premium", "starter", "agency"].includes(plan) && ["active", "trialing"].includes(status);
    return hasPaidAccess ? "user-dashboard.html" : "pricing.html";
  }

  function getSafeRedirect(defaultPath) {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
      return defaultPath;
    }
    return redirect;
  }

  async function apiCall(endpoint, payload) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include", // Include cookies in request
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data && data.error ? data.error : `HTTP ${response.status}`);
    }

    // Store user data in localStorage for UI state (token is in httpOnly cookie)
    if (data && data.user) {
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data;
  }

  async function checkAuth() {
    // Verify authentication status with server
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        credentials: "include", // Include cookies
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
          return data.user;
        }
      }

      // Not authenticated
      localStorage.removeItem("user");
      return null;
    } catch {
      localStorage.removeItem("user");
      return null;
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const params = new URLSearchParams(window.location.search);
    const isLoginPage = Boolean(document.getElementById("loginForm"));
    const selectedPlan = params.get("plan");

    if (["basic", "pro", "premium", "starter", "agency"].includes(selectedPlan)) {
      localStorage.setItem("pendingPlan", selectedPlan);
    }

    const signupPlanSelect = document.getElementById("signupPlan");
    const signupLeadStateGroup = document.getElementById("signupLeadStateGroup");
    const signupLeadStateSelect = document.getElementById("signupLeadState");

    function normalizePlan(plan) {
      if (plan === "starter") return "basic";
      if (plan === "agency") return "premium";
      return plan || "basic";
    }

    function updateLeadStateRequirement() {
      if (!signupPlanSelect || !signupLeadStateGroup || !signupLeadStateSelect) return;
      const plan = normalizePlan(signupPlanSelect.value);
      const needsLeadState = ["basic", "pro"].includes(plan);
      signupLeadStateGroup.classList.toggle("d-none", !needsLeadState);
      signupLeadStateSelect.required = needsLeadState;
      signupLeadStateSelect.disabled = !needsLeadState;
      if (!needsLeadState) signupLeadStateSelect.value = "";
    }

    if (signupPlanSelect) {
      const pendingPlan = selectedPlan || localStorage.getItem("pendingPlan") || signupPlanSelect.value;
      signupPlanSelect.value = pendingPlan === "starter" ? "basic" : pendingPlan === "agency" ? "premium" : pendingPlan;
      updateLeadStateRequirement();
      signupPlanSelect.addEventListener("change", updateLeadStateRequirement);
    }

    if (params.get("reset") === "1") {
      // Clear local storage and cookies
      localStorage.removeItem("user");
      localStorage.removeItem("pendingPlan");
      // Call logout to clear cookie
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include"
      }).finally(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }

    // If a logged-in user briefly lands on login.html, verify the cookie before showing the form.
    if (isLoginPage && !IS_LOCAL_DEV) {
      const user = await checkAuth();
      if (user) {
        window.location.replace(getSafeRedirect(getDashboardForUser(user)));
        return;
      }
      localStorage.removeItem("user");
    }

    document.body.classList.remove("auth-checking");

    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const message = document.getElementById("authMessage");

    if (loginForm) {
      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = document.getElementById("loginSubmit");
        const identifier =
          (document.getElementById("loginIdentifier") || document.getElementById("loginEmail") || {}).value?.trim() || "";
        const password = (document.getElementById("loginPassword") || {}).value || "";

        setButtonLoading(submitButton, true, "Logging in...");
        if (message) {
          message.className = "d-none";
          message.textContent = "";
        }

        try {
          const data = await apiCall("/auth/login", { identifier, password });
          setMessage(message, "success", "Login successful. Redirecting...");
          // Small delay to ensure cookie is set
          setTimeout(() => {
            window.location.href = getSafeRedirect(getDashboardForUser(data.user));
          }, 500);
        } catch (err) {
          setMessage(message, "danger", err.message || "Login failed.");
        } finally {
          setButtonLoading(submitButton, false, "Logging in...");
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = document.getElementById("signupSubmit");
        const chosenPlan = normalizePlan((document.getElementById("signupPlan") || {}).value || selectedPlan || localStorage.getItem("pendingPlan") || "basic");
        const payload = {
          firstName: (document.getElementById("signupFirstName") || {}).value?.trim() || "",
          lastName: (document.getElementById("signupLastName") || {}).value?.trim() || "",
          username: (document.getElementById("signupUsername") || {}).value?.trim() || "",
          email: (document.getElementById("signupEmail") || {}).value?.trim() || "",
          phone: (document.getElementById("signupPhone") || {}).value?.trim() || "",
          businessName: (document.getElementById("signupBusinessName") || {}).value?.trim() || "",
          billingAddressLine1: (document.getElementById("signupAddress1") || {}).value?.trim() || "",
          billingAddressLine2: (document.getElementById("signupAddress2") || {}).value?.trim() || "",
          billingCity: (document.getElementById("signupCity") || {}).value?.trim() || "",
          billingState: (document.getElementById("signupState") || {}).value?.trim() || "",
          billingPostalCode: (document.getElementById("signupPostalCode") || {}).value?.trim() || "",
          billingCountry: (document.getElementById("signupCountry") || {}).value?.trim() || "US",
          leadState: ["basic", "pro"].includes(chosenPlan) ? (document.getElementById("signupLeadState") || {}).value?.trim() || "" : "",
          password: (document.getElementById("signupPassword") || {}).value || "",
          plan: chosenPlan
        };

        setButtonLoading(submitButton, true, "Creating account...");
        if (message) {
          message.className = "d-none";
          message.textContent = "";
        }

        try {
          const data = await apiCall("/auth/signup", payload);
          setMessage(message, "success", "Account created. Opening secure checkout for your 3-day trial...");
          setTimeout(() => {
            window.location.href = data.checkoutUrl || getSafeRedirect(getDashboardForUser(data.user));
          }, 500);
        } catch (err) {
          setMessage(message, "danger", err.message || "Signup failed.");
        } finally {
          setButtonLoading(submitButton, false, "Creating account...");
        }
      });
    }
  });
})();
